'use strict'

var AddressType = require('./types/Address')
var ArrayType = require('./types/ArrayType')
var BoolType = require('./types/Bool')
var BytesType = require('./types/DynamicByteArray')
var BytesXType = require('./types/FixedByteArray')
var EnumType = require('./types/Enum')
var StringType = require('./types/StringType')
var StructType = require('./types/Struct')
var IntType = require('./types/Int')
var UintType = require('./types/Uint')

/**
  * Uint decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g uint256, uint32)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName}
  */
function Uint (type) {
  type === 'uint' ? 'uint256' : type
  var storageBytes = parseInt(type.replace('uint', '')) / 8
  return new UintType(storageBytes)
}

/**
  * Int decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g int256, int32)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName}
  */
function Int (type) {
  type === 'int' ? 'int256' : type
  var storageBytes = parseInt(type.replace('int', '')) / 8
  return new IntType(storageBytes)
}

/**
  * Address decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g address)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName}
  */
function Address (type) {
  return new AddressType()
}

/**
  * Bool decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g bool)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName}
  */
function Bool (type) {
  return new BoolType()
}

/**
  * DynamicByteArray decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g bytes storage ref)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName}
  */
function DynamicByteArray (type) {
  return new BytesType()
}

/**
  * FixedByteArray decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g bytes16)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName}
  */
function FixedByteArray (type) {
  var storageBytes = parseInt(type.replace('bytes', ''))
  return new BytesXType(storageBytes)
}

/**
  * StringType decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g string storage ref)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName}
  */
function String (type) {
  return new StringType()
}

/**
  * ArrayType decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g int256[] storage ref, int256[] storage ref[] storage ref)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName, arraySize, subArray}
  */
function Array (type, stateDefinitions) {
  var arraySize
  var match = type.match(/(.*)\[(.*?)\]( storage ref| storage pointer| memory| calldata)?$/)
  if (!match || match.length < 3) {
    console.log('unable to parse type ' + type)
    return null
  }
  arraySize = match[2] === '' ? 'dynamic' : parseInt(match[2])
  var underlyingType = parseType(match[1], stateDefinitions)
  if (underlyingType === null) {
    console.log('unable to parse type ' + type)
    return null
  }
  return new ArrayType(underlyingType, arraySize)
}

/**
  * Enum decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g enum enumDef)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName, enum}
  */
function Enum (type, stateDefinitions) {
  var enumDef = getEnum(type, stateDefinitions)
  if (enumDef === null) {
    console.log('unable to retrieve decode info of ' + type)
    return null
  }
  return new EnumType(enumDef)
}

/**
  * Struct decode the given @arg type
  *
  * @param {String} type - type given by the AST (e.g struct structDef storage ref)
  * @return {Object} returns decoded info about the current type: { storageBytes, typeName, members}
  */
function Struct (type, stateDefinitions) {
  var match = type.match(/struct (.*?)( storage ref| storage pointer| memory| calldata)?$/)
  if (!match) {
    return null
  }
  var memberDetails = getStructMembers(match[1], stateDefinitions) // type is used to extract the ast struct definition
  if (!memberDetails) return null
  return new StructType(memberDetails)
}

/**
  * retrieve enum declaration of the given @arg type
  *
  * @param {String} type - type given by the AST (e.g enum enumDef)
  * @param {Object} stateDefinitions  - all state declarations given by the AST (including struct and enum type declaration)
  * @return {Array} - containing all value declaration of the current enum type
  */
function getEnum (type, stateDefinitions) {
  for (var k in stateDefinitions) {
    var dec = stateDefinitions[k]
    if (dec.attributes && dec.attributes.name && type === 'enum ' + dec.attributes.name) {
      return dec
    }
  }
  return null
}

/**
  * retrieve memebers declared in the given @arg tye
  *
  * @param {String} typeName - name of the struct type (e.g struct <name>)
  * @param {Object} stateDefinitions  - all state definition given by the AST (including struct and enum type declaration)
  * @return {Array} containing all members of the current struct type
  */
function getStructMembers (typeName, stateDefinitions) {
  var members = []
  var storageBytes = 0
  for (var k in stateDefinitions) {
    var dec = stateDefinitions[k]
    if (dec.name === 'StructDefinition' && typeName === dec.attributes.name) {
      for (var i in dec.children) {
        var member = dec.children[i]
        var decoded = parseType(member.attributes.type, stateDefinitions)
        if (!decoded) {
          console.log('unable to retrieve decode info of ' + member.attributes.type)
          return null
        }
        members.push(decoded)
        storageBytes += decoded.storageBytes
      }
      break
    }
  }
  return {
    members: members,
    storageBytes: storageBytes
  }
}

/**
  * parse the full type
  *
  * @param {String} fullType - type given by the AST (ex: uint[2] storage ref[2])
  * @return {String} returns the token type (used to instanciate the right decoder) (uint[2] storage ref[2] will return 'array', uint256 will return uintX)
  */
function typeClass (fullType) {
  if (fullType.indexOf(']') !== -1) {
    return 'array'
  }
  if (fullType.indexOf(' ') !== -1) {
    fullType = fullType.split(' ')[0]
  }
  var char = fullType.indexOf('bytes') === 0 ? 'X' : ''
  return fullType.replace(/[0-9]+/g, char)
}

/**
  * parse the type and return an object representing the type
  *
  * @param {Object} type - type name given by the ast node
  * @param {Object} stateDefinitions - all state stateDefinitions given by the AST (including struct and enum type declaration)
  * @return {Object} - return the corresponding decoder or null on error
  */
function parseType (type, stateDefinitions) {
  var decodeInfos = {
    'address': Address,
    'array': Array,
    'bool': Bool,
    'bytes': DynamicByteArray,
    'bytesX': FixedByteArray,
    'enum': Enum,
    'string': String,
    'struct': Struct,
    'int': Int,
    'uint': Uint
  }
  var currentType = typeClass(type)
  if (currentType === null) {
    console.log('unable to retrieve decode info of ' + type)
    return null
  }
  return decodeInfos[currentType](type, stateDefinitions)
}

module.exports = {
  parseType: parseType,
  Uint: Uint,
  Address: Address,
  Bool: Bool,
  DynamicByteArray: DynamicByteArray,
  FixedByteArray: FixedByteArray,
  Int: Int,
  String: String,
  Array: Array,
  Enum: Enum,
  Struct: Struct
}
