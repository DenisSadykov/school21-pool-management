/**
 * School21 Pool — приёмник синхронизации сайт → Google Sheets.
 *
 * Куда вставить:
 *   Открой таблицу → Расширения → Apps Script → удали всё → вставь этот файл.
 *   Поменяй SECRET ниже на свой (такой же положишь в backend/.env как SYNC_SECRET).
 *   Разверни: Развернуть → Новое развёртывание → тип "Веб-приложение"
 *     - Запуск от имени: Я
 *     - У кого есть доступ: Все
 *   Скопируй URL вида https://script.google.com/macros/s/XXXX/exec
 *   и положи его в backend/.env как SYNC_WEBHOOK_URL.
 *
 * Скрипт ничего не удаляет в твоих вкладках — он только ДОПИСЫВАЕТ строки
 * в служебные вкладки "site_signups" и "site_penalties" (создаст их сам).
 *
 * Для полного экспорта из админки скрипт обновляет листы с префиксом "export_".
 */

var SECRET = 'pool-2026-xyz'; // совпадает с SYNC_SECRET в backend/.env

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (SECRET && body.secret !== SECRET) {
      return json({ ok: false, error: 'bad secret' });
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (body.mode === 'full_export') {
      return fullExport(ss, body);
    }
    var processed = [];
    (body.items || []).forEach(function (it) {
      var p = it.payload || {};
      if (it.entity === 'signup') {
        getSheet(ss, 'site_signups',
          ['Когда', 'Действие', 'Дата смены', 'Время', 'Метка', 'Ник'])
          .appendRow([p.at || new Date(), it.action, p.date || '', p.time || '', p.label || '', p.nick || '']);
      } else if (it.entity === 'penalty') {
        getSheet(ss, 'site_penalties',
          ['Когда', 'Действие', 'Ученик', 'Волонтёр', 'Часы', 'Статус', 'Описание'])
          .appendRow([p.at || new Date(), it.action, p.student || '', p.volunteer || '',
            p.total_hours || p.hours || '', p.status || '', p.description || '']);
      }
      processed.push(it.id);
    });
    return json({ ok: true, processed: processed });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function fullExport(ss, body) {
  var written = [];
  var sheets = body.sheets || {};
  Object.keys(sheets).forEach(function (name) {
    var values = sheets[name] || [];
    var exportName = 'export_' + name;
    var sh = recreateExportSheet(ss, name, exportName);
    writeValuesToExport(sh, values, name !== 'shifts' && name !== 'tribe_events');
    written.push(exportName);
  });
  var meta = getSheet(ss, 'export_meta', ['key', 'value']);
  meta.clearContents();
  meta.appendRow(['key', 'value']);
  meta.appendRow(['exported_at', body.exported_at || new Date()]);
  meta.appendRow(['sheets', written.join(', ')]);
  return json({ ok: true, sheets: written });
}

function recreateExportSheet(ss, sourceName, exportName) {
  var old = ss.getSheetByName(exportName);
  if (old) {
    ss.deleteSheet(old);
  }
  var source = ss.getSheetByName(sourceName);
  if (source) {
    var copy = source.copyTo(ss);
    copy.setName(exportName);
    ss.setActiveSheet(copy);
    ss.moveActiveSheet(ss.getNumSheets());
    return copy;
  }
  return ss.insertSheet(exportName);
}

function writeValuesToExport(sh, values, keepFirstRow) {
  if (!values || values.length === 0) return;
  var maxCols = values.reduce(function (max, row) {
    return Math.max(max, (row || []).length);
  }, 0);
  maxCols = Math.max(maxCols, sh.getMaxColumns());
  if (maxCols === 0) return;

  var startRow = keepFirstRow ? 2 : 1;
  var rowsToClear = Math.max(0, sh.getMaxRows() - startRow + 1);
  if (rowsToClear > 0) {
    var targetRange = sh.getRange(startRow, 1, rowsToClear, maxCols);
    targetRange.clearContent();
    targetRange.clearDataValidations();
  }

  var rowsToWrite = keepFirstRow ? values.slice(1) : values;
  if (rowsToWrite.length === 0) return;
  var normalized = rowsToWrite.map(function (row) {
    row = row || [];
    var result = row.slice();
    while (result.length < maxCols) result.push('');
    return result;
  });
  sh.getRange(startRow, 1, normalized.length, maxCols).setValues(normalized);
}

function doGet() {
  return json({ ok: true, message: 'School21 Pool sync endpoint is alive' });
}

function getSheet(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers && headers.length) {
      sh.appendRow(headers);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
  }
  return sh;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
