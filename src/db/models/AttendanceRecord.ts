import JsonModel from './JsonModel';

export default class AttendanceRecord extends JsonModel {
  static table = 'attendance_records';

  get serverId(): string {
    return this._getRaw('server_id') as string;
  }

  get markType(): string {
    return this._getRaw('mark_type') as string;
  }

  get timestamp(): string {
    return this._getRaw('timestamp') as string;
  }
}
