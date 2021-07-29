
const MendeleyColors = require('../config/MendeleyColors')
const Code = require('./Code')
const Theme = require('./Theme')

class Codebook {
  constructor (folderId, groupId, themes) {
    this.folderId = folderId || null
    this.groupId = groupId || null
    this.themes = themes || []
  }
  toObject () {
    let codebook = []
    this.themes.forEach((theme) => {
      if (theme.name == null || theme.color == null) return
      let t = {}
      t['name'] = theme.name
      t['color'] = theme.color
      if (theme.description != null) t['description'] = theme.description
      if (theme.ownWorkCode != null) t['ownWorkCode'] = theme.ownWorkCode
      t['codes'] = []
      if (theme.codes != null && Array.isArray(theme.codes)) {
        theme.codes.forEach((code) => {
          if (code.name == null) return
          let c = {}
          c['name'] = code.name
          if (code.description != null) c['description'] = code['description']
          if (code.operational != null) c['operational'] = code['operational']
          if (code.synonyms != null) c['synonyms'] = code['synonyms']
          t['codes'].push(c)
        })
      }
      codebook.push(t)
    })
    return codebook
  }
  toMinifiedObject () {
    let codebook = []
    this.themes.forEach((theme) => {
      if (theme.name == null || theme.color == null) return
      let t = {}
      t['n'] = theme.name
      t['c'] = theme.color
      if (theme.ownWorkCode != null) t['o'] = theme.ownWorkCode
      codebook.push(t)
    })
    return codebook
  }
  getFreeColor () {
    let themesColors = this.themes.map((theme) => { return theme.color })
    return MendeleyColors.find((color) => { return themesColors.indexOf(color) === -1 })
  }
  moveThemeToPosition (themeName, position) {
    let themeOldPosition = this.themes.findIndex((theme) => { return theme.name === themeName })
    if (themeOldPosition === -1) return null
    let theme = this.themes[themeOldPosition]
    this.themes.splice(themeOldPosition, 1)
    this.themes.splice(position, 0, theme)
    return true
  }
  getNewThemeName () {
    let themeTitle = 'New theme'
    let theme = this.getThemeByName(themeTitle)
    if (theme == null) return themeTitle
    for (let i = 2; i < 8; i++) {
      themeTitle = `New theme ${i}`
      let t = this.getThemeByName(themeTitle)
      if (t == null) return themeTitle
    }
    return null
  }
  removeTheme (themeName) {
    let themePosition = this.themes.findIndex((theme) => { return theme.name === themeName })
    if (themePosition !== -1) this.themes.splice(themePosition, 1)
  }
  insertTheme (theme) {
    this.themes.push(theme)
  }
  insertThemeAtPos (themeName, color, position) {
    let theme = new Theme(themeName, color)
    this.themes.splice(position, 0, theme)
  }
  getThemeByColor (color) {
    return this.themes.find((theme) => { return theme.color === color })
  }
  getThemeByName (themeName) {
    return this.themes.find((theme) => { return theme.name === themeName })
  }
  static fromObject (object) {
    if (!Array.isArray(object)) return
    let codebook = new Codebook()
    object.forEach((themeElement) => {
      if (themeElement.color == null || themeElement.name == null) return
      let theme = new Theme(themeElement.name, themeElement.color)
      if (themeElement.description != null) theme.description = themeElement.description
      if (themeElement.ownWorkCode != null) theme.ownWorkCode = themeElement.ownWorkCode
      if (themeElement.codes != null && Array.isArray(themeElement.codes)) {
        themeElement.codes.forEach((codeElement) => {
          if (codeElement.name == null) return
          let code = new Code(codeElement.name)
          if (codeElement.description != null) code.description = codeElement.description
          if (codeElement.operational != null) code.operational = codeElement.operational
          if (codeElement.synonyms != null) code.synonyms = codeElement.synonyms
          theme.insertCode(code)
        })
      }
      codebook.insertTheme(theme)
    })
    return codebook
  }
  static fromOldGeneral (generalCodebook, ownWorkCoding) {
    let codebookColors = Object.keys(generalCodebook)
    let codebook = new Codebook()
    codebookColors.forEach((color) => {
      let theme = new Theme(generalCodebook[color], color)
      if (ownWorkCoding[color] != null) theme.ownWorkCode = ownWorkCoding[color]
      codebook.themes.push(theme)
    })
    return codebook
  }
  static isValidOldVersionCodebookMinified (codebook) {
    let keys = Object.keys(codebook)
    let invalidEntry = keys.find((entry) => {
      let entryKeys = Object.keys(codebook[entry])
      if (entryKeys.length != 1 && entryKeys.length != 2) return true
      if (entryKeys.indexOf('n') == -1) return true
      if (entryKeys.length == 2 && entryKeys.indexOf('c') == -1) return true
    })
    return invalidEntry == null
  }
  static isValidCodebookMinified (minifiedCodebook) {
    if (Array.isArray(minifiedCodebook)) {
      let invalidProp = minifiedCodebook.find((entry) => {
        let keys = Object.keys(entry)
        if (keys.length != 2 && keys.length != 3) return true
        if (keys.indexOf('c') == -1) return true
        if (keys.indexOf('n') == -1) return true
        if (keys.length == 3 && keys.indexOf('o') == -1) return true
      })
      return invalidProp == null
    }
    return false
  }
  static fromMinifiedObject (object) {
    if (!this.isValidCodebookMinified(object)) return null
    let codebook = new Codebook()
    object.forEach((theme) => {
      let t = new Theme(theme.n, theme.c)
      if (theme['o'] != null) t.ownWorkCode = theme['o']
      codebook.insertTheme(t)
    })
    return codebook
  }
  static fromMinifiedObjectOldVersion (object) {
    if (!this.isValidOldVersionCodebookMinified(object)) return null
    let codebook = new Codebook()
    let colors = Object.keys(object)
    colors.forEach((color) => {
      if (object[color]['n'] == null) return
      let theme = new Theme()
      theme.color = color
      theme.name = object[color]['n']
      if (object[color]['c'] != null) theme.ownWorkCode = object[color]['c']
      codebook.insertTheme(theme)
    })
    return codebook
  }
}

module.exports = Codebook
