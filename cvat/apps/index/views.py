from django.shortcuts import render
from django.shortcuts import HttpResponse
from django.http import JsonResponse
# Create your views here.

import happybase


# def create_dataset(request):
#     if request.method == 'POST':
#         # create a form instance, and populate it with the data from the request
#         # dataset = Dataset(request.POST)
        
#         param = request.POST.dict()
#         print(request.POST)
#         return JsonResponse({'table_seletor': param['table_selector'], 'type_selector': param['type_selector']})

def index(request):
    if request.method == 'GET':
        connection = happybase.Connection('ai-master.sh.intel.com')
        table_list = connection.tables()
        
        data = []
        for table in table_list:
            if (table.decode('utf-8')).startswith('Drug') or (table.decode('utf-8')).startswith('drug'):
                tmp = {}
                tmp['name'] = table.decode('utf-8')
                tmp['type'] = 'Medicine'
                tmp['link'] = 'http://127.0.0.1:8080/molview'
                tmp['training_link'] = 'http://davinci-dev994.sh.intel.com:8890/notebooks/Drug.ipynb'
                tmp['inference_link'] = 'http://davinci-dev994.sh.intel.com:8890/notebooks/Drug_Synthesis.ipynb'
            else:
                tmp = {}
                tmp['name'] = table.decode('utf-8')
                tmp['type'] = 'Medical Imaging'
                tmp['link'] = 'http://127.0.0.1:8080/?id=71'
                tmp['training_link'] = 'http://ai-master-bigdl-0.sh.intel.com:5050/notebooks/training_script.ipynb'
                tmp['inference_link'] = 'http://ai-master-bigdl-0.sh.intel.com:5050/notebooks/inference_script.ipynb'
            data.append(tmp)
        
        context = {'tables': data}

        return render(request, 'index/index.html', context=context)