from django.shortcuts import render
from django.shortcuts import HttpResponse
import os
import json
from thrift.transport import TSocket
from thrift.protocol import TBinaryProtocol
from thrift.transport import TTransport
from hbase import Hbase


# Create your views here.

def display_3D_frame(request):
      # cwd = os.getcwd()
      # smiles_file = open(os.path.join(cwd,'smiles_sample.smiles'), 'r')
      # smiles_list = []
      # index = 0
      # for line in smiles_file:
      #       smiles_list.append((line.strip(), index))
      #       index += 1
      
      # Connect to HBase Thrift server
      host = 'ai-master.sh.intel.com'
      port = 9090
      transport = TTransport.TBufferedTransport(TSocket.TSocket(host, port))
      protocol = TBinaryProtocol.TBinaryProtocol(transport)
      client = Hbase.Client(protocol)
      transport.open()

      row_key_list = []
      # row key starts from 1
      for i in range(1, 101):
            row_key_list.append(str(i))

      smiles_list = []
      for row_key in row_key_list:
            row_label = client.get('drug', row_key, 'label')
            row_data = client.get('drug', row_key, 'data')
            smiles_list.append((row_label[0].value, row_data[0].value, row_key))

      transport.close()

      context_var = {
            'smiles_list': smiles_list,
      }
      
      return render(request, 'molview.html', context=context_var)


def change_label(request):
      print(request.body)
      dict_from_req = json.loads(request.body.decode(encoding='utf-8'))
      new_label = dict_from_req['new_label']
      ind = dict_from_req['index']
      response_data = {'modified_label': new_label}

      # Connect to HBase Thrift server
      host = 'ai-master.sh.intel.com'
      port = 9090
      transport = TTransport.TBufferedTransport(TSocket.TSocket(host, port))
      protocol = TBinaryProtocol.TBinaryProtocol(transport)
      client = Hbase.Client(protocol)
      transport.open()
      # add/update rows with thrift
      mutations = [Hbase.Mutation(column='label:', value=new_label)]
      client.mutateRow('drug', ind, mutations)
      transport.close()


      return HttpResponse(json.dumps(response_data), content_type='application/json', status=200)

