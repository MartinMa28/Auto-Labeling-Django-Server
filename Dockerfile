FROM ubuntu:16.04

ARG http_proxy
ARG https_proxy
ARG no_proxy

ENV TERM=xterm \
    http_proxy=${http_proxy}   \
    https_proxy=${https_proxy} \
    no_proxy=${no_proxy}


ENV LANG='C.UTF-8'  \
    LC_ALL='C.UTF-8'

ARG USER
ARG TF_ANNOTATION
ENV TF_ANNOTATION=${TF_ANNOTATION}
ARG DJANGO_CONFIGURATION
ENV DJANGO_CONFIGURATION=${DJANGO_CONFIGURATION}



# Remove original /etc/apt/sources.list, and use aliyun sources
RUN rm /etc/apt/sources.list
COPY sources.list /etc/apt/sources.list

# Install necessary apt packages
RUN apt-get update && \
    apt-get install -yq \
        python-software-properties \
        software-properties-common \
        wget && \
    add-apt-repository ppa:mc3man/xerus-media -y && \
    add-apt-repository ppa:mc3man/gstffmpeg-keep -y && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -yq \
        apache2 \
        apache2-dev \
        libapache2-mod-xsendfile \
        supervisor \
        ffmpeg \
        gstreamer0.10-ffmpeg \
        libldap2-dev \
        libsasl2-dev \
        python3-dev \
        python3-pip \
        unzip \
        unrar \
        p7zip-full \
        libsm6 \
        vim && \
    rm -rf /var/lib/apt/lists/*

#java
RUN wget https://build.funtoo.org/distfiles/oracle-java/jdk-8u152-linux-x64.tar.gz && \
    gunzip jdk-8u152-linux-x64.tar.gz && \
    tar -xf jdk-8u152-linux-x64.tar -C /opt && \
    rm jdk-8u152-linux-x64.tar && \
    ln -s /opt/jdk1.8.0_152 /opt/jdk


#spark
RUN wget http://mirrors.shu.edu.cn/apache/spark/spark-2.3.2/spark-2.3.2-bin-hadoop2.7.tgz && \
    tar -zxvf spark-2.3.2-bin-hadoop2.7.tgz && \
    rm spark-2.3.2-bin-hadoop2.7.tgz && \
    mv spark-2.3.2-bin-hadoop2.7 /opt/

# Add a non-root user
ENV USER=${USER}
ENV HOME /home/${USER}
WORKDIR ${HOME}
RUN adduser --shell /bin/bash --disabled-password --gecos "" ${USER}

# Install tf annotation if need
COPY cvat/apps/tf_annotation/docker_setup_tf_annotation.sh /tmp/tf_annotation/
COPY cvat/apps/tf_annotation/requirements.txt /tmp/tf_annotation/
ENV TF_ANNOTATION_MODEL_PATH=${HOME}/rcnn/frozen_inference_graph.pb

RUN if [ "$TF_ANNOTATION" = "yes" ]; then \
        /tmp/tf_annotation/docker_setup_tf_annotation.sh; \
    fi

ARG WITH_TESTS
RUN if [ "$WITH_TESTS" = "yes" ]; then \
        wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
        echo 'deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main' | tee /etc/apt/sources.list.d/google-chrome.list && \
        wget -qO- https://deb.nodesource.com/setup_9.x | bash - && \
        apt-get update && \
        DEBIAN_FRONTEND=noninteractive apt-get install -yq \
            google-chrome-stable \
            nodejs && \
        rm -rf /var/lib/apt/lists/*; \
        mkdir tests && cd tests && npm install \
            eslint \
            eslint-detailed-reporter \
            karma \
            karma-chrome-launcher \
            karma-coverage \
            karma-junit-reporter \
            karma-qunit \
            qunit; \
        echo "export PATH=~/tests/node_modules/.bin:${PATH}" >> ~/.bashrc; \
    fi

# Install and initialize CVAT, copy all necessary files, bigDL jar, and HBase XML config files
COPY cvat/requirements/ /tmp/requirements/
COPY supervisord.conf mod_wsgi.conf wait-for-it.sh manage.py ${HOME}/
RUN  pip3 install -i https://pypi.tuna.tsinghua.edu.cn/simple --no-cache-dir -r /tmp/requirements/${DJANGO_CONFIGURATION}.txt
RUN pip3 install -i https://pypi.tuna.tsinghua.edu.cn/simple jupyter
COPY cvat/ ${HOME}/cvat
COPY tests ${HOME}/tests
COPY test_images ${HOME}/test_images
COPY jupyter_notebooks ${HOME}/jupyter_notebooks
COPY Hbase.py ${HOME}/Hbase.py
COPY ttypes.py ${HOME}/ttypes.py
COPY AI-Master-0.1.0-SNAPSHOT-jar-with-dependencies.jar ${HOME}/AI-Master-0.1.0-SNAPSHOT-jar-with-dependencies.jar
COPY hbase-site.xml ${HOME}/hbase-site.xml
COPY core-site.xml ${HOME}/core-site.xml
COPY predict_script.sh ${HOME}/predict_script.sh
COPY train_script.sh ${HOME}/train_script.sh
COPY model_new_helper_API_10.obj ${HOME}/model_new_helper_API_10.obj
COPY proxy.py ${HOME}/proxy.py
RUN patch -p1 < ${HOME}/cvat/apps/engine/static/engine/js/3rdparty.patch
RUN chown -R ${USER}:${USER} .

# In order to fix the compatibility problem between python3 and HBase, ask for permission and substitute
# the Hbase.py and ttypes.py (in ${HOME}/) for those in original package directory
RUN chown -R ${USER}:${USER} /usr/local/lib/python3.5/dist-packages/hbase
RUN rm /usr/local/lib/python3.5/dist-packages/hbase/Hbase.py
RUN rm /usr/local/lib/python3.5/dist-packages/hbase/ttypes.py
RUN cp ${HOME}/Hbase.py /usr/local/lib/python3.5/dist-packages/hbase/Hbase.py
RUN cp ${HOME}/ttypes.py /usr/local/lib/python3.5/dist-packages/hbase/ttypes.py
# RUN mkdir /home/xml_File
# RUN mv ${HOME}/hbase-site.xml /home/xml_File/
# RUN mv ${HOME}/core-site.xml /home/xml_File/

# set up java and spark environment paths
ENV JAVA_HOME="/opt/jdk"
ENV SPARK_HOME="/opt/spark-2.3.2-bin-hadoop2.7"
ENV PATH=${JAVA_HOME}/bin:${SPARK_HOME}/bin:${PATH}


# RUN all commands below as 'django' user
USER ${USER}

RUN mkdir data share media keys logs /tmp/supervisord
RUN python3 manage.py collectstatic

RUN chmod +x ${HOME}/wait-for-it.sh

EXPOSE 8080 8443 5050
ENTRYPOINT ["/usr/bin/supervisord"]
