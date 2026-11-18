import { Model } from '@nozbe/watermelondb';

// Shared base for every cache table: all of them store the full server record
// as a JSON blob in `payload` (see schema.ts for why) plus a couple of raw
// indexed columns read directly via _getRaw. No @field decorators — the repo's
// babel.config.js doesn't have the decorator plugin wired up, and decorators
// are just sugar over _getRaw/_setRaw, so plain getters avoid touching babel
// config (and its build-risk) for this feature.
export default class JsonModel extends Model {
  get payload(): any {
    const raw = this._getRaw('payload');
    if (!raw) return null;
    try {
      return JSON.parse(raw as string);
    } catch {
      return null;
    }
  }

  get updatedAt(): number {
    return (this._getRaw('updated_at') as number) || 0;
  }
}
