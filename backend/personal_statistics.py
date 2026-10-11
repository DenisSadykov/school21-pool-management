"""Read-only personal statistics. No model imports, DB writes or new schema."""
from collections import defaultdict
from datetime import datetime, timedelta


def _interval(block):
    try:
        start = datetime.combine(block.date, datetime.strptime(block.time_start, '%H:%M').time())
        end = datetime.combine(block.date, datetime.strptime(block.time_end, '%H:%M').time())
        if end < start:
            end += timedelta(days=1)
        return start, end
    except (TypeError, ValueError):
        return None


def build_personal_statistics(memberships, shifts, reviews, rewards, pools, meetings,
                              *, now, rates, event_types, shift_reward_type):
    today = now.date()
    membership_map = {row.pool_id: row for row in memberships}
    shifts_by_pool, reviews_by_pool = defaultdict(list), defaultdict(list)
    rewards_by_pool, meetings_by_pool = defaultdict(list), defaultdict(list)
    for row in shifts:
        shifts_by_pool[row.pool_id].append(row)
    for row in reviews:
        reviews_by_pool[row.pool_id].append(row)
    for row in rewards:
        if row.event_type != 'confession':
            rewards_by_pool[row.pool_id].append(row)
    for row in meetings:
        meetings_by_pool[row.pool_id].append(row)

    monthly = {}
    month_index = today.year * 12 + today.month - 1
    for index in range(month_index - 11, month_index + 1):
        key = f'{index // 12:04d}-{index % 12 + 1:02d}'
        monthly[key] = {'month': key, 'shifts': 0, 'hours': 0}

    history, upcoming, all_breakdown = [], [], {}
    summary = dict(pools=0, active_pools=0, shifts=0, past_shifts=0, upcoming_shifts=0,
                   past_hours=0, upcoming_hours=0, exam_shifts=0, weekend_shifts=0,
                   group_reviews=0, tribe_meetings=0, assistant_meetings=0, coins=0)
    warnings = []
    for pool in pools:
        pv = membership_map.get(pool.id)
        role = (pv.pool_role or 'volunteer') if pv else None
        buckets = {}
        shift_history = []

        def add(key, label, count, coins):
            if count or coins:
                item = buckets.setdefault(key, {'type': key, 'label': label, 'count': 0, 'coins': 0})
                item['count'] += count
                item['coins'] += coins

        stats = dict(shifts=0, past_shifts=0, upcoming_shifts=0, past_hours=0,
                     upcoming_hours=0, exam_shifts=0, weekend_shifts=0,
                     group_reviews=0, tribe_meetings=0, assistant_meetings=0)
        for block in shifts_by_pool[pool.id]:
            stats['shifts'] += 1
            interval = _interval(block)
            if interval is None:
                warnings.append('Есть смены с некорректным временем: их часы не учтены.')
                continue
            start, end = interval
            hours = (end - start).total_seconds() / 3600
            past = end <= now
            shift_history.append(dict(id=block.id, date=block.date.isoformat(), time_start=block.time_start,
                                      time_end=block.time_end, hours=round(hours, 2), label=block.label or '',
                                      state='past' if past else 'in_progress' if start <= now else 'upcoming'))
            stats['past_shifts' if past else 'upcoming_shifts'] += 1
            stats['past_hours' if past else 'upcoming_hours'] += hours
            if past:
                stats['exam_shifts'] += int(block.label == 'EXAM')
                stats['weekend_shifts'] += int(block.date.weekday() >= 5)
                month = block.date.strftime('%Y-%m')
                if month in monthly:
                    monthly[month]['shifts'] += 1
                    monthly[month]['hours'] += hours
            else:
                upcoming.append(dict(id=block.id, pool_name=pool.name, date=block.date.isoformat(),
                                     time_start=block.time_start, time_end=block.time_end,
                                     label=block.label or '', in_progress=start <= now))
            # Coins mirror the existing volunteer page, including planned shifts.
            kind, label, rate = shift_reward_type(block, pool)
            # Existing reward calculation is used deliberately, also for legacy overnight blocks.
            reward_hours = ((end - start).seconds / 3600)
            add(kind, label, reward_hours, int(reward_hours * rate))

        group_total = sum(row.quantity or 0 for row in reviews_by_pool[pool.id])
        stats['group_reviews'] = sum(row.quantity or 0 for row in reviews_by_pool[pool.id]
                                     if row.review_date <= today)
        add('group_review', 'Проверка групповых', group_total, group_total * rates['group_review'])
        if pv and pv.has_confession:
            add('confession', 'Исповедь', 1, rates['confession'])
        related_meetings = meetings_by_pool[pool.id]
        past_meetings = [row for row in related_meetings if row.event_date < today]
        if role in ('tribe_master', 'tribe_assistant'):
            counted = related_meetings if role == 'tribe_master' else [
                row for row in past_meetings if row.assistant_attending]
            event_count = (pv.tribe_event_count_override if pv.tribe_event_count_override is not None
                           else len(counted))
            stats['tribe_meetings'] = len(past_meetings) if role == 'tribe_master' else len(counted)
            stats['assistant_meetings'] = len(counted) if role == 'tribe_assistant' else 0
            add('tribe_master_event', 'Трайб-мастерство' if role == 'tribe_master' else 'Помощь трайб-мастеру',
                event_count, event_count * rates['tribe_master_event'])
        if role in ('team_lead', 'responsible_team_lead'):
            add('team_lead', 'Тимлид команды волонтёров', 1, rates['team_lead'])
        for event in rewards_by_pool[pool.id]:
            add(event.event_type, event_types.get(event.event_type, {}).get('label', event.event_type),
                event.quantity or 1, event.coins)
        if pv and pv.coins_adjustment:
            add('manual', 'Ручная корректировка', 1, pv.coins_adjustment)
        breakdown = list(buckets.values())
        coins = sum(row['coins'] for row in breakdown)
        for row in breakdown:
            aggregate = all_breakdown.setdefault(row['type'], dict(type=row['type'], label=row['label'], count=0, coins=0))
            aggregate['count'] += row['count']
            aggregate['coins'] += row['coins']
        for key, value in stats.items():
            summary[key] += value
        summary['coins'] += coins
        summary['pools'] += 1
        # Achievement counts only pools with past recorded activity, not empty invitations.
        summary['active_pools'] += int(bool(stats['past_shifts'] or stats['group_reviews'] or stats['tribe_meetings']))
        history.append(dict(id=pool.id, name=pool.name, start_date=pool.start_date.isoformat() if pool.start_date else None,
                            state='archived' if pool.archived else 'active' if pool.active else 'ended',
                            role=role, tribe=pv.tribe if pv else None, coins=coins, coin_breakdown=breakdown,
                            shift_history=sorted(shift_history, key=lambda row: (row['date'], row['time_start']), reverse=True),
                            manual_event_count=pv.tribe_event_count_override if pv else None, **stats))

    history.sort(key=lambda row: (row['start_date'] or '', row['id']), reverse=True)
    upcoming.sort(key=lambda row: (row['date'], row['time_start'], row['id']))
    for item in monthly.values():
        item['hours'] = round(item['hours'], 2)
    for target in [summary, *history]:
        for key in ('past_hours', 'upcoming_hours'):
            target[key] = round(target[key], 2)

    conditions = [
        ('first_shift', 'Первый шаг', 'Первая прошедшая запись на смену', 'past_shifts', 1),
        ('ten_shifts', 'Надёжное плечо', '10 прошедших записей на смены', 'past_shifts', 10),
        ('twenty_five_shifts', 'Опора бассейна', '25 прошедших записей на смены', 'past_shifts', 25),
        ('fifty_hours', '50 часов рядом', '50 часов в прошедших сменах по расписанию', 'past_hours', 50),
        ('exam_shift', 'Экзамен под контролем', 'Прошедшая запись на экзаменационную смену', 'exam_shifts', 1),
        ('weekend_shifts', 'Выходной в команде', '3 прошедшие записи на смены в выходные', 'weekend_shifts', 3),
        ('three_pools', 'Не первый бассейн', 'Прошедшая активность в 3 бассейнах', 'active_pools', 3),
        ('group_reviews', 'Вместе разберёмся', '5 групповых проверок с наступившей датой', 'group_reviews', 5),
        ('tribe_meetings', 'Свои люди', '3 прошедшие встречи своего трайба в роли мастера или помощника', 'tribe_meetings', 3),
        ('assistant_meetings', 'Правая рука', 'Присутствие отмечено на 3 прошедших встречах', 'assistant_meetings', 3),
    ]
    achievements = [dict(id=key, title=title, description=description, target=target,
                         value=summary[metric], unlocked=summary[metric] >= target)
                    for key, title, description, metric, target in conditions]
    legacy_rewards = rewards_by_pool.get(None, [])
    if legacy_rewards:
        warnings.append('Есть старые начисления без привязки к бассейну: показаны отдельно, не включены в итог.')
    if any(row['manual_event_count'] is not None for row in history):
        warnings.append('Ручное количество трайб-мероприятий влияет на коины, но не выдаёт ачивки за встречи.')
    return dict(as_of=now.isoformat(), timezone='Europe/Moscow', summary=summary,
                monthly_activity=list(monthly.values()), pools=history, upcoming_shifts=upcoming[:10],
                achievements=achievements, coin_breakdown=list(all_breakdown.values()),
                unscoped_rewards=dict(count=len(legacy_rewards), coins=sum(row.coins for row in legacy_rewards)),
                warnings=sorted(set(warnings)))
