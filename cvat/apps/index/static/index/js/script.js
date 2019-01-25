// get cookie csrf manually
function getCookie(name) {
      var cookieValue = null;
      if (document.cookie && document.cookie !== '') {
          var cookies = document.cookie.split(';');
          for (var i = 0; i < cookies.length; i++) {
              var cookie = jQuery.trim(cookies[i]);
              // Does this cookie string begin with the name we want?
              if (cookie.substring(0, name.length + 1) === (name + '=')) {
                  cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                  break;
              }
          }
      }
      return cookieValue;
}
var csrftoken = getCookie('csrftoken');

function createTask(){
      let form_array = $('form').serializeArray();
      let table_name = form_array[1].value;
      let data_type = form_array[2].value;
      let labels = form_array[3].value;

      if (data_type.trim() !== 'image'){
            return;
      }else{
            let httpRequest = new XMLHttpRequest();

            if (!httpRequest){
                  alert('Cannot create an XMLHTTP instance');
                  return false;
            }
            httpRequest.onreadystatechange = function(){
                  if (httpRequest.readyState === XMLHttpRequest.DONE){
                        if (httpRequest.status === 200){
                              let json_response = JSON.parse(httpRequest.responseText);
                              let tid = parseInt(json_response.tid, 10);
                              console.log(`create a new task, tid = ${tid}`);
                              setTimeout(function(){
                                    getJobID(tid);
                              }, 5000);
                        } else{
                              alert('There was a problem with the request!');
                        }
                  }
            };

            httpRequest.open('POST', 'http://127.0.0.1:8080/create/task', true);
            httpRequest.setRequestHeader('Content-Type', 'application/json');
            httpRequest.setRequestHeader("X-CSRFToken", csrftoken);
            let data = JSON.stringify({'table_name': table_name, 'labels': labels});
            httpRequest.send(data);
      }
}

function getJobID(tid){
      let httpRequest = new XMLHttpRequest();
      if (!httpRequest){
            alert('Cannot create an XMLHTTP instance');
            return false;
      }
      httpRequest.onreadystatechange = function(){
            if (httpRequest.readyState === XMLHttpRequest.DONE){
                  if (httpRequest.status === 200){
                        let json_response = JSON.parse(httpRequest.responseText);
                        let jobID = json_response.jobs[0];
                        console.log('job id:', jobID);
                        console.log('http://127.0.0.1:8080/?id='+jobID);
                  } else{
                        alert('There was a problem with the request!');
                  }
            }
      };
      httpRequest.open('GET', 'http://127.0.0.1:8080/get/task/'+String(tid).trim(), true);
      httpRequest.send();
}

$(document).ready(function(){
      $('#create-dataset').on('click', createTask);
});