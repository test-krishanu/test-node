const Y = require("yjs");
const syncProtocol = require("y-protocols/dist/sync.cjs");
const awarenessProtocol = require("y-protocols/dist/awareness.cjs");
const DB = require("./data").default;
const encoding = require("lib0/dist/encoding.cjs");
const decoding = require("lib0/dist/decoding.cjs");
import { log } from "./init";
//const map = require('lib0/dist/map.cjs')

const debounce = require("lodash.debounce");

const callbackHandler = require("./callback.js").callbackHandler;
const isCallbackSet = require("./callback.js").isCallbackSet;
import { SaveHisEventType } from "./commonTypes";
import { STATUS_DOC_LOCKED } from "./constants";

const CALLBACK_DEBOUNCE_WAIT =
  parseInt(process.env.CALLBACK_DEBOUNCE_WAIT) || 2000;
const CALLBACK_DEBOUNCE_MAXWAIT =
  parseInt(process.env.CALLBACK_DEBOUNCE_MAXWAIT) || 10000;

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;
const wsReadyStateClosing = 2; // eslint-disable-line
const wsReadyStateClosed = 3; // eslint-disable-line

const getUniqueID = function () {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + "-" + s4();
};
// disable gc when using snapshots!
const gcEnabled = process.env.GC !== "false" && process.env.GC !== "0";
const persistenceDir = process.env.YPERSISTENCE;
/**
 * @type {{bindState: function(string,WSSharedDoc):void, writeState:function(string,WSSharedDoc):Promise<any>, provider: any}|null}
 */
let persistence = null;
if (typeof persistenceDir === "string") {
  console.info('Persisting documents to "' + persistenceDir + '"');
  // @ts-ignore
  const LeveldbPersistence = require("y-leveldb").LeveldbPersistence;
  const ldb = new LeveldbPersistence(persistenceDir);
  persistence = {
    provider: ldb,
    bindState: async (docName, ydoc) => {
      const persistedYdoc = await ldb.getYDoc(docName);
      const newUpdates = Y.encodeStateAsUpdate(ydoc);
      ldb.storeUpdate(docName, newUpdates);
      Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
      ydoc.on("update", (update) => {
        ldb.storeUpdate(docName, update);
      });
    },
    writeState: async (docName, ydoc) => {},
  };
}
function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== "default") {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(
          n,
          k,
          d.get
            ? d
            : {
                enumerable: true,
                get: function () {
                  return e[k];
                },
              }
        );
      }
    });
  }
  n["default"] = e;
  return Object.freeze(n);
}
var decoding__namespace = /*#__PURE__*/ _interopNamespace(decoding);

const messageYjsSyncStep1 = 0;
const messageYjsSyncStep2 = 1;
const messageYjsUpdate = 2;

/**
 * @param {{bindState: function(string,WSSharedDoc):void,
 * writeState:function(string,WSSharedDoc):Promise<any>,provider:any}|null} persistence_
 */
exports.setPersistence = (persistence_) => {
  persistence = persistence_;
};

/**
 * @return {null|{bindState: function(string,WSSharedDoc):void,
 * writeState:function(string,WSSharedDoc):Promise<any>}|null} used persistence layer
 */
exports.getPersistence = () => persistence;

/**
 * @type {Map<string,WSSharedDoc>}
 */
const docs = new Map();
const lockedDocs = new Map();
// exporting docs so that others can use it
exports.docs = docs;

const messageSync = 0;
const messageAwareness = 1;
const messageLock = 2;
// const messageAuth = 2

/**
 * @param {Uint8Array} update
 * @param {any} origin
 * @param {WSSharedDoc} doc
 */
const updateHandler = async (update, origin, doc) => {
  const handleLog = log.getSubLogger({
    prefix: ["[handleHandler]"],
  });
  handleLog.info("in update handler of utils. update origin: " + origin);
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);
  //this line would probably not cover the clients on the other server while scaling
  handleLog.info("sending update over all connections");
  doc.conns.forEach(
    async (_, conn) => await send(doc, conn, message, handleLog)
  );
};
