
const axios = require('axios')
const Swal = require('sweetalert2')


class Alerts {
  static showHelpDialog () {
    let helpDialogUrl = chrome.extension.getURL('pages/helpDialog.html')
    axios.get(helpDialogUrl).then((response) => {
      Swal.fire({
        type: 'question',
        title: 'Do you need some help?',
        html: response.data,
        showCloseButton: true,
        showConfirmButton: false
      })
    })
  }

  static showProcrastinationMessage (reason) {
    Swal.fire({
      type: 'warning',
      title: 'Saturation alert',
      html: reason,
      showCancelButton: true,
      showConfirmButton: true,
      confirmButtonText: "Don't show again",
      cancelButtonText: 'Close',
      cancelButtonColor: '#3085d6',
      confirmButtonColor: '#aaa'
    }).then((result) => {
      if (result.value) {
        chrome.storage.sync.set({"CHECK_PROCRASTINATION_ENABLED":false},() => {
          Framendeley.checkProcrastinationEnabled = false
        })
      }
    })
  }

  static showErrorWindow (message) {
    Swal.fire({
      type: 'error',
      html: message
    })
  }

  static showWarningWindow (message){
    Swal.fire({
      type: 'warning',
      html: message
    })
  }
}

module.exports = Alerts
