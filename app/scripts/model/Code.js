
class Code {
  constructor (name, description, operational, synonyms) {
    this.name = name || ''
    this.description = description || null
    this.operational = operational || null
    this.synonyms = synonyms || []
  }
}

module.exports = Code
