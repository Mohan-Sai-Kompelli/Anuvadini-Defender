import { Model } from '@nozbe/watermelondb';

export default class SyncMeta extends Model {
  static table = 'sync_meta';

  get key(): string {
    return this._getRaw('key') as string;
  }

  get syncedAt(): number {
    return (this._getRaw('synced_at') as number) || 0;
  }
}
