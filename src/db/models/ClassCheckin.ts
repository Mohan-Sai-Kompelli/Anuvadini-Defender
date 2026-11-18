import JsonModel from './JsonModel';

export default class ClassCheckin extends JsonModel {
  static table = 'class_checkins';

  get dateKey(): string {
    return this._getRaw('date_key') as string;
  }
}
