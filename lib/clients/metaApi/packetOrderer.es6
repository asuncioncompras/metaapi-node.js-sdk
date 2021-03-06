'use strict';

/**
 * Class which orders the synchronization packets
 */
export default class PacketOrderer {

  /**
   * Constructs the class
   * @param {Function} outOfOrderListener function which will receive out of order packet events
   * @param {Number} orderingTimeoutInSeconds packet ordering timeout
   */
  constructor(outOfOrderListener, orderingTimeoutInSeconds) {
    this._outOfOrderListener = outOfOrderListener;
    this._orderingTimeoutInSeconds = orderingTimeoutInSeconds;
    this._isOutOfOrderEmitted = {};
    this._waitListSizeLimit = 100;
  }

  /**
   * Initializes the packet orderer
   */
  start() {
    this._sequenceNumberByInstance = {};
    this._lastSessionStartTimestamp = {};
    this._packetsByInstance = {};
    if (!this._outOfOrderInterval) {
      this._outOfOrderInterval = setInterval(() => this._emitOutOfOrderEvents(), 1000);
    }
  }

  /**
   * Deinitialized the packet orderer
   */
  stop() {
    clearInterval(this._outOfOrderInterval);
  }

  /**
   * Processes the packet and resolves in the order of packet sequence number
   * @param {Object} packet packet to process
   * @return {Array<Object>} ordered packets when the packets are ready to be processed in order
   */
  // eslint-disable-next-line complexity
  restoreOrder(packet) {
    let instanceId = packet.accountId + ':' + (packet.instanceIndex || 0);
    if (packet.sequenceNumber === undefined) {
      return [packet];
    }
    if (packet.type === 'synchronizationStarted' && packet.synchronizationId) {
      // synchronization packet sequence just started
      this._isOutOfOrderEmitted[instanceId] = false;
      this._sequenceNumberByInstance[instanceId] = packet.sequenceNumber;
      this._lastSessionStartTimestamp[instanceId] = packet.sequenceTimestamp;
      this._packetsByInstance[instanceId] = (this._packetsByInstance[instanceId] || [])
        .filter(waitPacket => waitPacket.packet.sequenceTimestamp >= packet.sequenceTimestamp);
      return [packet].concat(this._findNextPacketsFromWaitList(instanceId));
    } else if (packet.sequenceTimestamp < this._lastSessionStartTimestamp[instanceId]) {
      // filter out previous packets
      return [];
    } else if (packet.sequenceNumber === this._sequenceNumberByInstance[instanceId]) {
      // let the duplicate s/n packet to pass through
      return [packet];
    } else if (packet.sequenceNumber === this._sequenceNumberByInstance[instanceId] + 1) {
      // in-order packet was received
      this._sequenceNumberByInstance[instanceId]++;
      return [packet].concat(this._findNextPacketsFromWaitList(instanceId));
    } else {
      // out-of-order packet was received, add it to the wait list
      this._packetsByInstance[instanceId] = this._packetsByInstance[instanceId] || [];
      let waitList = this._packetsByInstance[instanceId];
      waitList.push({
        instanceId,
        accountId: packet.accountId,
        instanceIndex: packet.instanceIndex || 0,
        sequenceNumber: packet.sequenceNumber,
        packet: packet,
        receivedAt: new Date()
      });
      waitList.sort((e1, e2) => e1.sequenceNumber - e2.sequenceNumber);
      while (waitList.length > this._waitListSizeLimit) {
        waitList.shift();
      }
      return [];
    }
  }

  _findNextPacketsFromWaitList(instanceId) {
    let result = [];
    let waitList = this._packetsByInstance[instanceId] || [];
    while (waitList.length && [this._sequenceNumberByInstance[instanceId],
      this._sequenceNumberByInstance[instanceId] + 1].includes(waitList[0].sequenceNumber)) {
      result.push(waitList[0].packet);
      if (waitList[0].sequenceNumber === this._sequenceNumberByInstance[instanceId] + 1) {
        this._sequenceNumberByInstance[instanceId]++;
      }
      waitList.splice(0, 1);
    }
    if (!waitList.length) {
      delete this._packetsByInstance[instanceId];
    }
    return result;
  }

  _emitOutOfOrderEvents() {
    for (let waitList of Object.values(this._packetsByInstance)) {
      if (waitList.length && waitList[0].receivedAt.getTime() + this._orderingTimeoutInSeconds * 1000 < Date.now()) {
        const instanceId = waitList[0].instanceId;
        if(!this._isOutOfOrderEmitted[instanceId]) {
          this._isOutOfOrderEmitted[instanceId] = true;
          // Do not emit onOutOfOrderPacket for packets that come before synchronizationStarted
          if (this._sequenceNumberByInstance[instanceId] !== undefined) {
            this._outOfOrderListener.onOutOfOrderPacket(waitList[0].accountId, waitList[0].instanceIndex,
              this._sequenceNumberByInstance[instanceId] + 1, waitList[0].sequenceNumber, waitList[0].packet,
              waitList[0].receivedAt);
          }
        }
      }
    }
  }

}
