#!/usr/bin/env python
#
# SPDX-License-Identifier: MIT
"""
Given a CVAT XML and a directory with the image dataset, this script reads the
CVAT XML and writes the annotations in PASCAL VOC format into a given
directory.

This implementation only supports bounding boxes in CVAT annotation format, and
warns if it encounter any tracks or annotations that are not bounding boxes,
ignoring them in both cases.
"""

import os
import argparse
import glog as log
from lxml import etree
from pascal_voc_writer import Writer


def parse_args():
    """Parse arguments of command line"""
    parser = argparse.ArgumentParser(
        description='Convert CVAT XML annotations to PASCAL VOC format'
    )

    parser.add_argument(
        '--cvat-xml', metavar='FILE', required=True,
        help='input file with CVAT annotation in xml format'
    )

    parser.add_argument(
        '--image-dir', metavar='DIRECTORY', required=True,
        help='directory which contains original images'
    )

    parser.add_argument(
        '--output-dir', metavar='DIRECTORY', required=True,
        help='directory for output annotations in PASCAL VOC format'
    )

    return parser.parse_args()


def process_cvat_xml(xml_file, image_dir, output_dir):
    """
    Transforms a single XML in CVAT format to multiple PASCAL VOC format
    XMls.

    :param xml_file: CVAT format XML
    :param image_dir: image directory of the dataset
    :param output_dir: directory of annotations with PASCAL VOC format
    :return:
    """
    KNOWN_TAGS = {'box', 'image', 'attribute'}
    os.makedirs(output_dir, exist_ok=True)
    cvat_xml = etree.parse(xml_file)

    tracks = [(x.get('id'), x.get('label'))
              for x in cvat_xml.findall('track')]
    if tracks:
        log.warn('Cannot parse interpolation tracks, ignoring {} tracks'.format(len(tracks)))

    for img_tag in cvat_xml.findall('image'):
        image_name = img_tag.get('name')
        width = img_tag.get('width')
        height = img_tag.get('height')
        image_path = os.path.join(image_dir, image_name)
        if not os.path.exists(image_path):
            log.warn('{} image cannot be found. Is `{}` image directory correct?'.
                format(image_path, image_dir))
        writer = Writer(image_path, width, height)

        unknown_tags = {x.tag for x in img_tag.iter()}.difference(KNOWN_TAGS)
        if unknown_tags:
            log.warn('Ignoring tags for image {}: {}'.format(image_path, unknown_tags))

        for box in img_tag.findall('box'):
            label = box.get('label')
            xmin = float(box.get('xtl'))
            ymin = float(box.get('ytl'))
            xmax = float(box.get('xbr'))
            ymax = float(box.get('ybr'))

            writer.addObject(label, xmin, ymin, xmax, ymax)

        anno_name = os.path.basename(os.path.splitext(image_name)[0] + '.xml')
        anno_dir = os.path.dirname(os.path.join(output_dir, image_name))
        os.makedirs(anno_dir, exist_ok=True)
        writer.save(os.path.join(anno_dir, anno_name))


def main():
    args = parse_args()
    process_cvat_xml(args.cvat_xml, args.image_dir, args.output_dir)


if __name__ == "__main__":
    main()
