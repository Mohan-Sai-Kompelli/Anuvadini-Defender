import JsonModel from './JsonModel';

export default class WfhStatus extends JsonModel {
  static table = 'wfh_status';

  get ownerUid(): string {
    return this._getRaw('owner_uid') as string;
  }
}
