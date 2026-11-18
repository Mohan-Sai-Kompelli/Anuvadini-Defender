import JsonModel from './JsonModel';

export default class SpotCheckHistory extends JsonModel {
  static table = 'spot_check_history';

  get serverId(): string {
    return this._getRaw('server_id') as string;
  }
}
