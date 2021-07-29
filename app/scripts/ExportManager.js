
const MendeleyContentScriptClient = require('./MendeleyContentScriptClient')

class ExportManager {
  static tableToLatex(){
    let relatedWorkTable = document.querySelector("#relatedWorkTable")
    let headerCells = relatedWorkTable.querySelectorAll("th")
    let text = `\\begin{table}[]
  \\begin{tabular}{|`
    for(let i=0;i<headerCells.length;i++){ text += 'l|' }
    text += `}
    \\hline
  Paper`;
    for(let i=1;i<headerCells.length;i++){
      text += ' & '+headerCells[i].innerText
    }
    let ourWorkRowCells = relatedWorkTable.querySelectorAll(".ourWorkRow td:not(.ourWorkLabel)")
    text += `\\\\\\hline
  This work`
    for(let i=0;i<ourWorkRowCells.length;i++){
      text += ' & '+ourWorkRowCells[i].innerText
    }
    let contentRows = relatedWorkTable.querySelectorAll(".contentRow")

    let cellToTable = (cell) => {
      let codes = []
      let annotations = cell.querySelectorAll(".relatedWorkAnnotation")
      for(let i=0;i<annotations.length;i++){
        if(annotations[i].getAttribute("annotationcode")!=null&&codes.indexOf(annotations[i].getAttribute("annotationcode"))==-1) codes.push(annotations[i].getAttribute("annotationcode"))
      }
      return codes.join(", ")
    }

    for(let i=0;i<contentRows.length;i++){
      text += `\\\\\\hline
    `
      let paperCell = contentRows[i].querySelector(".workTitle")
      text += '\\cite{'+paperCell.getAttribute("citationKey")+'}'
      let rowCells = contentRows[i].querySelectorAll("td")
      for(let j=1;j<rowCells.length;j++){
        text += ' & '+cellToTable(rowCells[j])
      }
    }

    text += `
    \\\\\\hline
  \\end{tabular}
  \\end{table}`

    return text
  }

  static tableToCSV(){

    const lineDelimiter = '\n'
    const cellDelimiter = ';'
    const ownWorkCellLabel = 'This work'

    let relatedWorkTable = document.querySelector("#relatedWorkTable")
    let headerCells = relatedWorkTable.querySelectorAll("th")

    let csvContent = ''

    let csvifiString = (str) => {
      return '"'+str.replace(/"/g,'""')+'"'
    }

    headerCells.forEach((cell,index) => {
      if(index > 0) csvContent += cellDelimiter
      csvContent += csvifiString(cell.innerText.trim())
      if(index === 0) csvContent += cellDelimiter + 'Citation key'// insert citation key
    })
    csvContent += lineDelimiter

    let ourWorkRowCells = relatedWorkTable.querySelectorAll(".ourWorkRow td:not(.ourWorkLabel)")
    csvContent += ownWorkCellLabel
    ourWorkRowCells.forEach((cell,index) => {
      csvContent += cellDelimiter
      csvContent += csvifiString(cell.innerText)
    })
    csvContent += lineDelimiter

    let contentRows = relatedWorkTable.querySelectorAll(".contentRow")

    let cellToTable = (cell) => {
      let codes = []
      let annotations = cell.querySelectorAll(".relatedWorkAnnotation")
      for(let i=0;i<annotations.length;i++){
        if(annotations[i].getAttribute("annotationcode")!=null&&codes.indexOf(annotations[i].getAttribute("annotationcode"))==-1) codes.push(annotations[i].getAttribute("annotationcode"))
      }
      return codes.join(", ")
    }

    contentRows.forEach((row,index) => {
      if(index > 0) csvContent += lineDelimiter
      let paperCell = row.querySelector('.workTitle')
      csvContent += csvifiString(paperCell.innerText)
      let citationKey = paperCell.getAttribute('citationkey') || ''
      csvContent += cellDelimiter + citationKey
      let rowCells = row.querySelectorAll('td:nth-child(n+2)')
      rowCells.forEach((rowCell) => {
        csvContent += cellDelimiter
        csvContent += csvifiString(cellToTable(rowCell))
      })
    })

    return csvContent
  }

  static folderDocumentsToBibtex(folderId,groupId){
    return new Promise((resolve, reject) => {
      MendeleyContentScriptClient.getFolderDocumentsBibtex(folderId,groupId).then((bibtex) => {

        resolve(bibtex)
      })
    })
  }
}

module.exports = ExportManager
