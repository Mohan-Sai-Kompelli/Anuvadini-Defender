import JsonModel from './JsonModel';

export default class CheckoutRequest extends JsonModel {
  static table = 'checkout_requests';

  get serverId(): string {
    return this._getRaw('server_id') as string;
  }

  get status(): string {
    return this._getRaw('status') as string;
  }
}
