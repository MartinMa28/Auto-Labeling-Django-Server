function changeIframe(){
      
      let ind = this.dataset.index;
      let smilesString = document.querySelector(`div.smiles-list-container td.smiles-string-${ind}`).dataset.smiles;
      console.log(smilesString);

      let iframeVar = $('div.iframe-container iframe');
      console.log('smiles:', iframeVar.attr('src', `https://embed.molview.org/v1/?mode=balls&smiles=${smilesString}`));
}


// get cookie csrf manually
function getCookie(name) {
      var cookieValue = null;
      if (document.cookie && document.cookie !== '') {
            console.log(document.cookie);
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                  var cookie = jQuery.trim(cookies[i]);
                  // console.log(cookie);
                  // Does this cookie string begin with the name we want?
                  if (cookie.substring(0, name.length + 1) === (name + '=')) {
                        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                        break;
                  }
            }
      }
      return cookieValue;
}


function changeLabel(){
      // get the index and the old label
      let ind = this.dataset.index;
      let $labelTag = $(`div.smiles-list-container td.label-${ind}`);

      let newLabel = prompt('Please input the new label:', $labelTag.text());
      
      // make a http post request to the server
      let httpRequest = new XMLHttpRequest();
      
      if (!httpRequest){
            alert('Cannot create an XMLHTTP instance');
            return false;
      }

      // call back function for the response
      httpRequest.onreadystatechange = function(){
            if (httpRequest.readyState === XMLHttpRequest.DONE){
                  if (httpRequest.status === 200){
                        let json_response = JSON.parse(httpRequest.responseText);
                        console.log(json_response.modified_label);
                        //window.location.reload(true);
                        $labelTag.text(json_response.modified_label);
                  } else{
                        alert('There was a problem with the request!');
                  }
            }
      };
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1'){
            httpRequest.open('POST', 'http://127.0.0.1:8080/molview/change_label', true);
      }else {
            httpRequest.open('POST', 'http://ai-master-bigdl-0.sh.intel.com:8080/molview/change_label', true);
      }
      httpRequest.setRequestHeader("Content-Type", "application/json");
      let csrftoken = getCookie('csrftoken');
      console.log(`csrf-token: ${csrftoken}`);
      httpRequest.setRequestHeader("X-CSRFToken", csrftoken);
      let data = JSON.stringify({'index': ind, 'new_label': newLabel});
      console.log(data);
      httpRequest.send(data); 
}

$(document).ready(function(){
      $('div.smiles-list-container .molview-btn').on('click', changeIframe);
      $('div.smiles-list-container .label-btn').on('click', changeLabel);
});