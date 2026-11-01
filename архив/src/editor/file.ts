// Карта как файл: открыть и сохранить. Карты читает и пишет API dev-сервера (src/server/api.ts) в public/maps.

import { DEFAULT_MAP, toMapFile, type LoadedMap } from '@shared/core/mapFile';
import { t } from '@shared/i18n';
import type { Stage } from '@shared/view/stage';
import { listMaps, readMap, writeMap } from './api';
import { confirmAsk, promptAsk } from './dialog';
import { Doc } from './doc';
import { report, session } from './session';
import { singleCellMap } from './ops';
import { ed } from './state';

function show(stage: Stage, id: string, loaded: LoadedMap): void {
    session.hover = null;
    if (session.doc) session.doc.open(loaded);
    else session.doc = Doc.create(stage, loaded);
    Object.assign(ed, { id, name: loaded.name, dirty: false, size: `${loaded.map.w}×${loaded.map.d}` });
    session.doc.syncHistory();
    session.levels();
    session.refresh();
    window.history.replaceState(null, '', `?map=${encodeURIComponent(id)}`);
}

/** Новая карта: после подтверждения и имени файла — пустая область с одной клеткой земли; на диск попадёт при сохранении. */
export async function newMap(stage: Stage): Promise<void> {
    if (ed.busy) return;
    if (!(await confirmAsk(t(ed.dirty ? 'editor.msg.confirmNewDirty' : 'editor.msg.confirmNew', [ed.name])))) return;
    const id = (await promptAsk(t('editor.msg.newId')))?.trim();
    if (!id) return;
    if (!/^[\w-]+$/.test(id)) return report('editor.msg.badId', [id], true);
    if (ed.maps.includes(id) && !(await confirmAsk(t('editor.msg.idTaken', [id])))) return;
    show(stage, id, { name: id, map: singleCellMap(), entities: [] });
    session.doc!.updateDirty();
    ed.dirty = true;
    report('editor.msg.created', [id]);
}

export async function openMap(stage: Stage, id: string): Promise<void> {
    if (ed.dirty && !(await confirmAsk(t('editor.msg.confirmLeave', [ed.name, id])))) return;
    ed.busy = true;
    try {
        show(stage, id, await readMap(id));
        report('editor.msg.opened', [ed.name]);
    } catch (e) {
        report('editor.msg.cantOpen', [id, (e as Error).message], true);
    } finally {
        ed.busy = false;
    }
}

export async function saveMap(): Promise<void> {
    const doc = session.doc;
    if (!doc || ed.busy) return;
    ed.busy = true;
    try {
        await writeMap(ed.id, toMapFile(ed.name, doc.map, doc.entities));
        doc.markSaved();
        report('editor.msg.saved', [`public/maps/${ed.id}.json`]);
        ed.maps = await listMaps();
    } catch (e) {
        report('editor.msg.notSaved', [(e as Error).message], true);
    } finally {
        ed.busy = false;
    }
}

/** Старт: список карт и та, что в адресе (или первая). */
export async function startFiles(stage: Stage): Promise<void> {
    ed.maps = await listMaps();
    const first = new URLSearchParams(location.search).get('map') ?? (ed.maps.includes(DEFAULT_MAP) ? DEFAULT_MAP : ed.maps[0]);
    if (first) await openMap(stage, first);
    else report('editor.msg.noMaps', [], true);
}
