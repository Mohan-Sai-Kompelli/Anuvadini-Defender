import JsonModel from './JsonModel';

export default class Holiday extends JsonModel {
  static table = 'holidays';

  get serverId(): string {
    return this._getRaw('server_id') as string;
  }
}
