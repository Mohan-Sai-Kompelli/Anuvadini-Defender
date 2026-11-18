import JsonModel from './JsonModel';

export default class Memo extends JsonModel {
  static table = 'memos';

  get serverId(): string {
    return this._getRaw('server_id') as string;
  }
}
