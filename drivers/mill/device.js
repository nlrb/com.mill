// eslint-disable-next-line import/no-unresolved
const Homey = require('homey');

class MillDevice extends Homey.Device {
  // this method is called when the Device is inited
  onInit() {
    this.deviceId = this.getData().id;

    this.log(`${this.getName()} ${this.getClass()} (${this.deviceId}) initialized`);

    this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature.bind(this));
    this.registerCapabilityListener('mill_mode', this.onCapabilityThermostatMode.bind(this));

    this.refreshTimeout = null;
    this.room = null;
    this.refreshState();
  }

  async refreshState() {
    this.log(`Refreshing state in ${this.getName()}`);

    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }

    if (Homey.app.isConnected()) {
      const millApi = Homey.app.getMillApi();

      const room = await millApi.listDevices(this.getData().id);
      this.log(`Refreshing state for ${room.roomName}: currentMode: ${room.currentMode}, comfortTemp: ${room.comfortTemp}, awayTemp: ${room.awayTemp}, avgTemp: ${room.avgTemp}, sleepTemp: ${room.sleepTemp}, heatStatus: ${room.heatStatus}`);
      this.room = room;
      Promise.all([
        this.setCapabilityValue('measure_temperature', room.avgTemp),
        this.setCapabilityValue('target_temperature', this.getTargetTemp(room)),
        this.setCapabilityValue('mill_mode', this.modeAsString(room)),
        this.setCapabilityValue('mill_onoff', this.heatStatusAsString(room.heatStatus))
      ]).then(() => {
        this.scheduleRefresh();
      }).catch((error) => {
        this.log('Error caught during refresh', error);
        this.scheduleRefresh();
      });
    } else {
      this.log('Mill not connected');
      this.scheduleRefresh(10);
    }
  }

  scheduleRefresh(interval) {
    const refreshInterval = interval || Homey.ManagerSettings.get('interval');
    this.refreshTimeout = setTimeout(this.refreshState.bind(this), refreshInterval * 1000);
    this.log(`Refreshing in ${refreshInterval} seconds`);
  }

  onAdded() {
    this.log('device added', this.getState());
  }

  onDeleted() {
    this.log('device deleted');
  }

  onCapabilityTargetTemperature(value, opts, callback) {
    const logDate = new Date().getTime();
    this.log(`${logDate}: onCapabilityTargetTemperature(${value})`);
    const temp = Math.ceil(value);
    if(temp !== value) { // half degrees isn't supported by Mill, need to round it up
      this.setCapabilityValue('target_temperature', temp);
      this.log(`${logDate}: onCapabilityTargetTemperature(${value}=>${temp})`);
    }
    const millApi = Homey.app.getMillApi();
    this.setTargetTemp(this.room, temp);
    millApi.changeRoomTemperature(this.deviceId, this.room)
      .then(() => {
        this.log(`${logDate}: onCapabilityTargetTemperature(${temp}) done`);
        this.log(`Changed temp for ${this.room.roomName} to ${temp}: currentMode: ${this.room.currentMode}/${this.room.programMode}, comfortTemp: ${this.room.comfortTemp}, awayTemp: ${this.room.awayTemp}, avgTemp: ${this.room.avgTemp}, sleepTemp: ${this.room.sleepTemp}`);
        callback(null, temp);
      }).catch((error) => {
        this.log(`${logDate}: onCapabilityTargetTemperature(${temp}) error`);
        this.log(`Change temp for ${this.room.roomName} to ${temp} resultet in error`, error);
        callback(error);
      });
  }

  onCapabilityThermostatMode(value, opts, callback) {
    const millApi = Homey.app.getMillApi();
    this.room.currentMode = this.modeAsInt(value);
    Promise.all([
      this.setCapabilityValue('target_temperature', this.getTargetTemp(this.room)),
      millApi.changeRoomMode(this.deviceId, this.room.currentMode)
    ]).then(() => {
      this.log(`Changed mode for ${this.room.roomName} to ${value}: currentMode: ${this.room.currentMode}/${this.room.programMode}, comfortTemp: ${this.room.comfortTemp}, awayTemp: ${this.room.awayTemp}, avgTemp: ${this.room.avgTemp}, sleepTemp: ${this.room.sleepTemp}`);
      callback(null, value);
    }).catch((error) => {
      this.log(`Change mode for ${this.room.roomName} to ${value} resultet in error`, error);
      callback(error);
    });
  }

  heatStatusAsString(status) {
    return status === 1;
  }

  getTargetTemp(room) {
    switch (room.currentMode>0?room.currentMode:room.programMode) {
      case 1:
        return room.comfortTemp;
      case 2:
        return room.sleepTemp;
      case 3:
        return room.awayTemp;
      case 5:
        return 0;
      default:
        return room.comfortTemp;
    }
  }

  setTargetTemp(room, newTemp) {
    switch (room.currentMode) {
      case 1:
        room.comfortTemp = newTemp;
        break;
      case 2:
        room.sleepTemp = newTemp;
        break;
      case 3:
        room.awayTemp = newTemp;
        break;
      default:
        break;
    }
  }

  modeAsString(room) {
    switch (room.currentMode>0?room.currentMode:room.programMode) {
      case 1:
        return 'Comfort';
      case 2:
        return 'Sleep';
      case 3:
        return 'Away';
      case 5:
        return 'Off';
      default:
        return 'Comfort';
    }
  }

  modeAsInt(mode) {
    switch (mode) {
      case 'Program':
        return 0;
      case 'Comfort':
        return 1;
      case 'Sleep':
        return 2;
      case 'Away':
        return 3;
      case 'Off':
        return 5;
      default:
        return 0;
    }
  }
}

module.exports = MillDevice;