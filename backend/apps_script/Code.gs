/**
 * School21 Pool -> formatted Google Sheets template.
 *
 * The platform is the source of truth. This script updates only managed input
 * ranges in the existing volunteers, shifts, penalty, tribe_event and
 * tribe_events sheets.
 */

var SECRET = 'replace-with-the-platform-sync-secret';
var MANAGED_SHEETS = ['volunteers', 'shifts', 'penalty', 'tribe_event', 'tribe_events'];

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (SECRET && body.secret !== SECRET) {
      return json({ ok: false, error: 'bad secret' });
    }
    if (body.mode !== 'template_snapshot_v1') {
      return json({ ok: false, error: 'unsupported mode' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var warnings = [];
    writeVolunteers(ss, body.volunteers || [], warnings);
    validateVolunteerNicks(ss, body, warnings);
    writeShifts(ss, body, warnings);
    writePenalties(ss, body.penalties || []);
    writeStudentEvents(ss, body.student_events || []);
    writeTribeEventsCalendar(ss, body.pool || {}, body.tribe_events || [], warnings);
    repairTemplateFormulas(ss);
    SpreadsheetApp.flush();

    return json({ ok: true, sheets: MANAGED_SHEETS, warnings: warnings });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function writeVolunteers(ss, volunteers, warnings) {
  var sheet = requireSheet(ss, 'volunteers');
  var maxRows = 58;
  var rows = volunteers.slice(0, maxRows);
  if (volunteers.length > maxRows) {
    warnings.push('В volunteers помещаются только первые ' + maxRows + ' участников');
  }

  sheet.getRange('A2:B59').clearContent();
  sheet.getRange('D2:D59').clearContent();
  sheet.getRange('F2:F59').clearContent();

  var nameFormulas = [];
  for (var formulaRow = 2; formulaRow <= 59; formulaRow += 1) {
    nameFormulas.push(['=IFERROR(VLOOKUP(B' + formulaRow + ',$H$2:$I$100,2,FALSE),"-")']);
  }
  sheet.getRange('A2:A59').setFormulas(nameFormulas);

  if (rows.length) {
    sheet.getRange(2, 2, rows.length, 1).setValues(rows.map(function (item) {
      return [item.nick || ''];
    }));
  }

  var tribeMasters = {};
  rows.forEach(function (item) {
    if (item.role !== 'tribe_master') return;
    var tribe = normalizeTribe(item.tribe);
    if (!tribe) {
      warnings.push('У трайб-мастера ' + item.nick + ' не указан трайб');
      return;
    }
    if (tribeMasters[tribe]) {
      warnings.push('Для трайба ' + item.tribe + ' указано несколько трайб-мастеров');
      return;
    }
    tribeMasters[tribe] = item.nick;
  });

  var tribeLabels = sheet.getRange('C2:C59').getDisplayValues();
  tribeLabels.forEach(function (row, index) {
    var tribe = normalizeTribe(row[0]);
    if (tribe && tribeMasters[tribe]) {
      sheet.getRange(index + 2, 4).setValue(tribeMasters[tribe]);
    }
  });

  var reviewers = rows.filter(function (item) {
    return item.is_group_reviewer;
  }).map(function (item) {
    return [item.nick || ''];
  });
  if (reviewers.length) {
    sheet.getRange(2, 6, reviewers.length, 1).setValues(reviewers);
  }
}

function validateVolunteerNicks(ss, body, warnings) {
  var sheet = requireSheet(ss, 'volunteers');
  var values = sheet.getRange('B2:B59').getDisplayValues();
  var known = {};
  values.forEach(function (row) {
    var nick = normalizeNick(row[0]);
    if (nick) known[nick] = true;
  });
  var missing = {};
  (body.shifts || []).forEach(function (block) {
    (block.volunteers || []).forEach(function (nick) {
      var normalized = normalizeNick(nick);
      if (normalized && !known[normalized]) missing[normalized] = true;
    });
  });
  var missingList = Object.keys(missing).sort();
  if (missingList.length) {
    warnings.push('В volunteers отсутствуют: ' + missingList.join(', '));
  }
}

function writeShifts(ss, body, warnings) {
  var sheet = requireSheet(ss, 'shifts');
  var startDate = parseIsoDate((body.pool || {}).start_date);
  if (!startDate) throw new Error('У бассейна не указана дата начала');

  sheet.getRange('G1').setValue(startDate);
  sheet.getRange('A2:G2').setFormulas([[
    '=$G$1', '=A2+1', '=B2+1', '=C2+1', '=D2+1', '=E2+1', '=F2+1'
  ]]);
  sheet.getRange('A15:G15').setFormulas([[
    '=G2+1', '=A15+1', '=B15+1', '=C15+1', '=D15+1', '=E15+1', '=F15+1'
  ]]);

  clearManagedShiftCells(sheet, 3, 14);
  clearManagedShiftCells(sheet, 16, 23);

  (body.shifts || []).forEach(function (block) {
    var blockDate = parseIsoDate(block.date);
    var offset = blockDate ? daysBetween(startDate, blockDate) : -1;
    if (offset < 0 || offset > 13) {
      warnings.push('Смена ' + block.date + ' находится вне 14-дневного шаблона');
      return;
    }
    var column = (offset % 7) + 1;
    var firstRow = offset < 7 ? 3 : 16;
    var lastRow = offset < 7 ? 14 : 23;
    var labelRow = findShiftLabelRow(sheet, column, firstRow, lastRow, block);
    if (!labelRow) {
      warnings.push('В shifts не найден слот ' + block.date + ' ' + block.time_start + '-' + block.time_end);
      return;
    }
    var availableRows = rowsBelowShiftLabel(sheet, column, labelRow, lastRow);
    var volunteers = block.volunteers || [];
    if (volunteers.length > availableRows.length) {
      warnings.push('Для смены ' + block.date + ' ' + block.time_start + ' не хватает ячеек в шаблоне');
    }
    volunteers.slice(0, availableRows.length).forEach(function (nick, index) {
      sheet.getRange(availableRows[index], column).setValue(nick);
    });
  });
}

function findShiftLabelRow(sheet, column, firstRow, lastRow, block) {
  var targetStart = String(block.time_start || '');
  var targetEnd = String(block.time_end || '');
  var values = sheet.getRange(firstRow, column, lastRow - firstRow + 1, 1).getDisplayValues();
  for (var index = 0; index < values.length; index += 1) {
    var label = String(values[index][0] || '');
    if (label.indexOf(targetStart) !== -1 && label.indexOf(targetEnd) !== -1) {
      return firstRow + index;
    }
  }
  return null;
}

function rowsBelowShiftLabel(sheet, column, labelRow, lastRow) {
  var rows = [];
  for (var row = labelRow + 1; row <= lastRow; row += 1) {
    var value = sheet.getRange(row, column).getDisplayValue();
    if (looksLikeShiftLabel(value)) break;
    if (value) break;
    rows.push(row);
  }
  return rows;
}

function clearManagedShiftCells(sheet, firstRow, lastRow) {
  var range = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, 7);
  var values = range.getDisplayValues();
  for (var row = 0; row < values.length; row += 1) {
    for (var column = 0; column < values[row].length; column += 1) {
      var value = values[row][column];
      if (value && !looksLikeShiftLabel(value)) {
        sheet.getRange(firstRow + row, column + 1).clearContent();
      }
    }
  }
}

function looksLikeShiftLabel(value) {
  return /^\s*\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/.test(String(value || ''));
}

function writePenalties(ss, penalties) {
  var sheet = requireSheet(ss, 'penalty');
  sheet.getRange('A2:G1000').clearContent();
  if (!penalties.length) return;
  var rows = penalties.map(function (item) {
    return [
      item.student || '',
      parseIsoDateTime(item.issued_at),
      item.description || '',
      item.volunteer || '',
      item.status || '',
      item.entered_by || '',
      parseIsoDateTime(item.assigned_at)
    ];
  });
  sheet.getRange(2, 1, rows.length, 7).setValues(rows);
}

function writeStudentEvents(ss, events) {
  var sheet = requireSheet(ss, 'tribe_event');
  sheet.getRange('A2:I1000').clearContent();
  if (!events.length) return;
  var rows = events.map(function (item) {
    return [
      item.student || '',
      item.tribe || '',
      parseIsoDate(item.event_date),
      item.event_type || '',
      item.description || '',
      item.tribe_master || '',
      parseIsoDateTime(item.created_at),
      Number(item.points || 0),
      item.status || ''
    ];
  });
  sheet.getRange(2, 1, rows.length, 9).setValues(rows);
}

function writeTribeEventsCalendar(ss, pool, events, warnings) {
  var sheet = requireSheet(ss, 'tribe_events');
  var startDate = parseIsoDate(pool.start_date);
  if (!startDate) return;
  var headerRows = [2, 10, 18, 26];
  var inputStartRows = [3, 11, 19, 27];

  headerRows.forEach(function (headerRow, week) {
    var dates = [];
    for (var day = 0; day < 7; day += 1) {
      dates.push(addDays(startDate, week * 7 + day));
    }
    sheet.getRange(headerRow, 1, 1, 7).setValues([dates]);
    sheet.getRange(inputStartRows[week], 1, 6, 7).clearContent();
  });

  var eventsByDay = {};
  events.forEach(function (event) {
    var eventDate = parseIsoDate(event.date);
    var offset = eventDate ? daysBetween(startDate, eventDate) : -1;
    if (offset < 0 || offset > 27) {
      warnings.push('Трайб-мероприятие ' + event.date + ' находится вне 28-дневного календаря');
      return;
    }
    if (!eventsByDay[offset]) eventsByDay[offset] = [];
    eventsByDay[offset].push(event);
  });

  Object.keys(eventsByDay).forEach(function (key) {
    var offset = Number(key);
    var week = Math.floor(offset / 7);
    var column = (offset % 7) + 1;
    var dayEvents = eventsByDay[offset];
    if (dayEvents.length > 6) {
      warnings.push('На ' + dayEvents[0].date + ' больше шести трайб-мероприятий');
    }
    dayEvents.slice(0, 6).forEach(function (event, index) {
      var parts = [];
      if (event.time_start) parts.push(event.time_start);
      if (event.tribe) parts.push(event.tribe);
      if (event.title) parts.push(event.title);
      var text = parts.join(' · ');
      if (event.location) text += '\n' + event.location;
      if (event.comment) text += '\n' + event.comment;
      sheet.getRange(inputStartRows[week] + index, column).setValue(text).setWrap(true);
    });
  });
}

function repairTemplateFormulas(ss) {
  var shifts = requireSheet(ss, 'shifts');
  shifts.getRange('K3').setFormula('=IFERROR(VLOOKUP(J3,reward_calc!A:R,18,FALSE),"нет данных")');
  var rewards = requireSheet(ss, 'reward_calc');
  rewards.getRange('B25').setFormula('=IF(COUNTIF(DFirstDay,A25)>0,10,0)+COUNTIF(DFirstDayEvening,A25)*1');
}

function requireSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Не найден лист ' + name);
  return sheet;
}

function normalizeNick(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase();
}

function normalizeTribe(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s*-?>\s*$/, '')
    .replace(/[^a-zа-яё0-9]/g, '');
}

function parseIsoDate(value) {
  if (!value) return null;
  return new Date(String(value).slice(0, 10) + 'T12:00:00');
}

function parseIsoDateTime(value) {
  return value ? new Date(value) : '';
}

function addDays(value, count) {
  var result = new Date(value.getTime());
  result.setDate(result.getDate() + count);
  return result;
}

function daysBetween(start, end) {
  var dayMs = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / dayMs);
}

function doGet() {
  return json({ ok: true, message: 'School21 Pool template export endpoint is alive' });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
