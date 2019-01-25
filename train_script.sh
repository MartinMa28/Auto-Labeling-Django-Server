spark-submit \
--verbose \
--master local[2] \
--driver-memory 8g \
--class com.intel.analytics.bigdl.models.resnet.TrainKfbio \
/home/yilinma/Documents/IntelliJ_IDEA_Projects/Test/target/AI-Master-0.1.0-SNAPSHOT-jar-with-dependencies.jar \
--batchSize 2 --nEpochs 30 --learningRate 0.1 --warmupEpoch 5 \
--maxLr 3.2 --depth 50 --classes 2 \
--coreSitePath /home/yilinma/Documents/BigDL_AI_Master/Test/core-site.xml \
--hbaseSitePath /home/yilinma/Documents/BigDL_AI_Master/Test/hbase-site.xml \
--hbaseTableName kfb_512_100_test --rowKeyStart 000000001 --rowKeyEnd 000000051 \
--modelSavingPath /home/yilinma/Documents/tmp/training_test_acc_30.obj
