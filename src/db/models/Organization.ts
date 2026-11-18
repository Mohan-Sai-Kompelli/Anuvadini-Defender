import JsonModel from './JsonModel';

export default class Organization extends JsonModel {
  static table = 'organizations';

  get serverId(): string {
    return this._getRaw('server_id') as string;
  }
}
