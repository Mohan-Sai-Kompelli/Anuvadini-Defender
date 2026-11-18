import JsonModel from './JsonModel';

export default class Profile extends JsonModel {
  static table = 'profiles';

  get serverId(): string {
    return this._getRaw('server_id') as string;
  }
}
