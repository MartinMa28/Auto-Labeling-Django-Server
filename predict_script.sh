spark-submit \
--master local[4] \
--driver-memory 8g \
--class com.intel.analytics.bigdl.models.resnet.test \
/home/django/AI-Master-0.1.0-SNAPSHOT-jar-with-dependencies.jar \
/home/django/core-site.xml \
/home/django/hbase-site.xml \
/home/django/model_new_helper_API_10.obj \
kfb_512_100_test 000000001 000000031 30
