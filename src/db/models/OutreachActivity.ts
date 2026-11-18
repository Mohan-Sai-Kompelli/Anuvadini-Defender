import JsonModel from './JsonModel';

export default class OutreachActivity extends JsonModel {
  static table = 'outreach_activities';

  get serverId(): string {
    return this._getRaw('server_id') as string;
  }
}
