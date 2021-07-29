
class Utils {
  static hasKeyValue (currentValue, index, arr) {
    let conditions = this
    for (let key in conditions) {
      if ((currentValue[key] == null) || (currentValue[key] != conditions[key])) return false
    }
    return true
  }

  static similarity (s1, s2) {
    let editDistance = (a1, a2) => {
      a1 = a1.toLowerCase()
      a2 = a2.toLowerCase()
      let costs = new Array()
      for (let i = 0; i <= a1.length; i++) {
        let lastValue = i
        for (let j = 0; j <= a2.length; j++) {
          if (i == 0) { costs[j] = j } else {
            if (j > 0) {
              let newValue = costs[j - 1]
              if (a1.charAt(i - 1) != a2.charAt(j - 1)) {
                newValue = Math.min(Math.min(newValue, lastValue),
                  costs[j]) + 1
              }
              costs[j - 1] = lastValue
              lastValue = newValue
            }
          }
        }
        if (i > 0) { costs[a2.length] = lastValue }
      }
      return costs[a2.length]
    }

    let longer = s1
    let shorter = s2
    if (s1.length < s2.length) {
      longer = s2
      shorter = s1
    }
    let longerLength = longer.length
    if (longerLength == 0) {
      return 1.0
    }
    return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength)
  }

  static getHexColor (r, g, b) {
    var rHex = r.toString(16)
    var gHex = g.toString(16)
    var bHex = b.toString(16)
    if (rHex.length == 1) rHex = '0' + rHex
    if (gHex.length == 1) gHex = '0' + gHex
    if (bHex.length == 1) bHex = '0' + bHex
    return rHex + gHex + bHex
  }

  static hexToRGB (hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null
  }

  static escapeHtml (text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  static backgroundColorToHex (b) {
    var a = b.replace('rgb(', '')
    a = a.replace(')', '')
    var c = a.split(',')
    return this.getHexColor(parseInt(c[0].trim()), parseInt(c[1].trim()), parseInt(c[2].trim()))
  }

  static isElement (o) {
    return (
      typeof HTMLElement === 'object' ? o instanceof HTMLElement // DOM2
        : o && typeof o === 'object' && o !== null && o.nodeType === 1 && typeof o.nodeName === 'string'
    )
  }

  static makeRequest (opts) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest()
      xhr.withCredentials = false
      xhr.onload = function () {
        if ((this.status >= 200 && this.status < 300) || (this.status == 400)) {
          resolve(xhr)
        } else {
          reject({
            status: this.status,
            statusText: xhr.statusText
          })
        }
      }
      xhr.onerror = function () {
        reject({
          status: this.status,
          statusText: xhr.statusText
        })
      }
      var params = opts.params
      // We'll need to stringify if we've been given an object
      // If we have a string, this is skipped.
      if (params && typeof params === 'object') {
        params = Object.keys(params).map(function (key) {
          return encodeURIComponent(key) + '=' + encodeURIComponent(params[key])
        }).join('&')
      }

      if (opts.method == 'POST') {
        // TO DO: REMOVE
        xhr.open(opts.method, opts.url)
        if (opts.headers) {
          Object.keys(opts.headers).forEach(function (key) {
            xhr.setRequestHeader(key, opts.headers[key])
          })
        }
        xhr.send(params)
      } else if (opts.method == 'GET') {
        if (params != null && params.length > 0) xhr.open(opts.method, opts.url + '?' + params)
        else xhr.open(opts.method, opts.url)
        if (opts.headers) {
          Object.keys(opts.headers).forEach(function (key) {
            xhr.setRequestHeader(key, opts.headers[key])
          })
        }
        xhr.send()
      } else if (opts.method == 'PUT') {
        xhr.open(opts.method, opts.url)
        if (opts.headers) {
          Object.keys(opts.headers).forEach(function (key) {
            xhr.setRequestHeader(key, opts.headers[key])
          })
        }
        xhr.send(params)
      } else if (opts.method == 'DELETE') {
        xhr.open(opts.method, opts.url)
        if (opts.headers) {
          Object.keys(opts.headers).forEach(function (key) {
            xhr.setRequestHeader(key, opts.headers[key])
          })
        }
        xhr.send(null)
      } else if (opts.method == 'PATCH') {
        xhr.open(opts.method, opts.url)
        if (opts.headers) {
          Object.keys(opts.headers).forEach(function (key) {
            xhr.setRequestHeader(key, opts.headers[key])
          })
        }
        xhr.send(params)
      }
    })
  }

  static hexToRGBA (hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (result == null) return null
    var r = parseInt(result[1], 16)
    var g = parseInt(result[2], 16)
    var b = parseInt(result[3], 16)
    // return "rgba("+r+", "+g+", "+b+", "+0.6+")"
    return 'rgb(' + r + ', ' + g + ', ' + b + ')'
  }

  static capitalizeFirst (str) {
    return str.charAt(0).toUpperCase() + str.substring(1)
  }
}

module.exports = Utils
