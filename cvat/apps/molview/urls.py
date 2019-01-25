from django.urls import path
from . import views

urlpatterns = [
      path('', views.display_3D_frame, name='molview'),
      path('change_label', views.change_label, name='molview_change_label'),
]