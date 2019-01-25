from django.urls import path
from . import views

urlpatterns = [
      path('', views.index, name='ai-master-dashboard'),
      # path('create_dataset', views.create_dataset),
]