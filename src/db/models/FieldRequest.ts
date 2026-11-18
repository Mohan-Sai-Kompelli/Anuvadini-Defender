import JsonModel from './JsonModel';

export default class FieldRequest extends JsonModel {
  static table = 'field_requests';

  get serverId(): string {
    return this._getRaw('server_id') as string;
  }

  get status(): string {
    return this._getRaw('status') as string;
  }
}
