import JsonModel from './JsonModel';

export default class TimetableRow extends JsonModel {
  static table = 'timetable_rows';

  get serverId(): string {
    return this._getRaw('server_id') as string;
  }
}
