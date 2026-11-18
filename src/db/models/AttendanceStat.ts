import JsonModel from './JsonModel';

export default class AttendanceStat extends JsonModel {
  static table = 'attendance_stats';

  get periodKey(): string {
    return this._getRaw('period_key') as string;
  }
}
