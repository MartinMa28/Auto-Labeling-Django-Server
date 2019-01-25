import socket
import os

def start_socket(table_name):
    os.system("spark-submit --master local[4] \
    --conf 'spark.driver.extraJavaOptions=-Dbigdl.engineType=mkldnn'\
    --conf 'spark.executor.extraJavaOptions=-Dbigdl.engineType=mkldnn' \
    --driver-memory 8g --class com.intel.analytics.bigdl.models.resnet.test \
    /home/django/AI-Master-0.1.0-SNAPSHOT-jar-with-dependencies.jar \
    /home/django/core-site.xml /home/django/hbase-site.xml \
    /home/django/model_new_helper_API_10.obj {}".format(table_name))

if __name__ == "__main__":
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

    proxy_port = 10002

    s.bind(('localhost', proxy_port))
    print('socket get bined to {}'.format(proxy_port))
    s.listen(5)

    while True:
        print('socket is listening')
        c, addr = s.accept()
        print('accepted a socket from {}:{}'.format(addr[0], addr[1]))
        rec_str = c.recv(1024).decode('utf-8')
        c.sendall('ready to start the socket with {}'.format(rec_str).encode('utf-8'))
        start_socket(rec_str)
        c.close()

