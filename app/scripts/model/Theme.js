
class Theme {
  constructor (name, color, description, ownWorkCode, codes) {
    this.name = name || ''
    this.color = color || null
    this.description = description || null
    this.ownWorkCode = ownWorkCode || null
    this.codes = codes || []
  }
  removeCode (codeName) {
    let codePosition = this.codes.findIndex((code) => {return code.name === codeName})
    if(codePosition !== -1) this.codes.splice(codePosition,1)
  }
  insertCode (code) {
    this.codes.push(code)
  }
  getCodeByName (codeName) {
    return this.codes.find((codeElement) => {return codeElement.name === codeName})
  }
}

module.exports = Theme
