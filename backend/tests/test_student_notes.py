from datetime import datetime, timedelta

import pytest
import app as m


@pytest.fixture()
def notes_setup(factories, db_session):
    author = factories.user('writer')
    pool = factories.pool(active=True)
    factories.assign(author, pool)
    student = m.Student(nick='pupil_one', name='Pupil', pool_id=pool.id)
    db_session.add(student)
    db_session.commit()
    return author, pool, student


def create(client, headers, student, text='Личное наблюдение', **extra):
    return client.post('/api/me/student-notes', headers=headers,
                       json={'student_id': student.id, 'text': text, **extra})


def test_note_crud_and_conflict(client, notes_setup, auth_headers):
    author, _, student = notes_setup
    headers = auth_headers(author)
    response = create(client, headers, student)
    assert response.status_code == 201
    note = response.get_json()
    assert note['created_at'] == note['updated_at']
    assert note['student_nick'] == student.nick
    assert 'author_id' not in note
    assert response.headers['Cache-Control'] == 'no-store'
    path = f"/api/me/student-notes/{note['id']}"
    edited = client.patch(path, headers=headers, json={'text': 'Обновлено', 'updated_at': note['updated_at']})
    assert edited.status_code == 200
    assert edited.get_json()['text'] == 'Обновлено'
    assert client.patch(path, headers=headers, json={'text': 'Устарело', 'updated_at': note['updated_at']}).status_code == 409
    assert client.get('/api/me/student-notes', headers=headers).get_json()['total'] == 1
    assert client.delete(path, headers=headers).status_code == 200
    assert client.get('/api/me/student-notes', headers=headers).get_json()['total'] == 0


@pytest.mark.parametrize('role', ['volunteer', 'tribe_master', 'tribe_assistant', 'team_lead', 'admin'])
def test_other_roles_cannot_read_change_or_delete(client, notes_setup, factories, auth_headers, role):
    author, pool, student = notes_setup
    other = factories.user(f'other_{role}', role=role)
    factories.assign(other, pool)
    note = create(client, auth_headers(author), student).get_json()
    headers = auth_headers(other)
    path = f"/api/me/student-notes/{note['id']}"
    for suffix in ['', f'?student_id={student.id}', f'?author_id={author.id}&q=pupil']:
        assert client.get('/api/me/student-notes' + suffix, headers=headers).get_json()['notes'] == []
    assert client.get(path, headers=headers).status_code in {404, 405}
    assert client.patch(path, headers=headers, json={'text': 'чужое', 'updated_at': note['updated_at']}).status_code == 404
    assert client.delete(path, headers=headers).status_code == 404
    # Supplying someone else's author_id never impersonates them.
    own = create(client, headers, student, author_id=author.id).get_json()
    assert client.get('/api/me/student-notes', headers=auth_headers(author)).get_json()['total'] == 1
    assert client.get('/api/me/student-notes', headers=headers).get_json()['notes'][0]['id'] == own['id']


def test_auth_membership_and_active_pool(client, notes_setup, factories, auth_headers, db_session):
    author, _, student = notes_setup
    assert client.get('/api/me/student-notes').status_code == 401
    assert create(client, {}, student).status_code == 401
    outsider = factories.user('outsider')
    assert create(client, auth_headers(outsider), student).status_code == 403
    old = factories.pool(archived=True)
    old_student = m.Student(nick='old_pupil', name='Old', pool_id=old.id)
    db_session.add(old_student)
    db_session.commit()
    assert create(client, auth_headers(author), old_student).status_code == 404
    initial = factories.user('initial', password=None)
    assert client.get('/api/me/student-notes', headers=auth_headers(initial)).status_code == 403


@pytest.mark.parametrize('text', ['', '  ', None, [], 123, 'a' * 4001])
def test_invalid_text(client, notes_setup, auth_headers, text):
    author, _, student = notes_setup
    assert create(client, auth_headers(author), student, text=text).status_code == 400


def test_input_validation(client, notes_setup, auth_headers):
    author, _, _ = notes_setup
    headers = auth_headers(author)
    for body in [[], {}, {'text': 'test', 'student_id': True}, {'text': 'test', 'student_id': 10**30}]:
        assert client.post('/api/me/student-notes', json=body, headers=headers).status_code == 400
    for suffix in ['?student_id=no', '?student_id=999999999999999', '?page=no', '?page=0', '?sort=invalid']:
        assert client.get('/api/me/student-notes' + suffix, headers=headers).status_code == 400


def test_search_sort_pagination_and_history(client, notes_setup, auth_headers, factories, db_session):
    author, pool, student = notes_setup
    headers = auth_headers(author)
    for i in range(51):
        time = datetime(2026, 10, 1) + timedelta(minutes=i)
        db_session.add(m.StudentNote(author_id=author.id, student_id=student.id, student_nick=student.nick,
                                    text=f'Заметка {i}', created_at=time, updated_at=time))
    db_session.commit()
    first = client.get('/api/me/student-notes?q=@PUPIL&sort=oldest', headers=headers).get_json()
    assert first['total'] == 51 and first['has_more'] and len(first['notes']) == 50
    assert first['notes'][0]['text'] == 'Заметка 0'
    assert client.get('/api/me/student-notes?page=2&sort=oldest', headers=headers).get_json()['notes'][0]['text'] == 'Заметка 50'
    assert client.get('/api/me/student-notes?q=%25', headers=headers).get_json()['total'] == 0
    assert client.get('/api/me/student-notes?sort=newest', headers=headers).get_json()['notes'][0]['text'] == 'Заметка 50'
    # Own notes remain readable/editable after the active pool changes or the pupil is removed.
    pool.active = False
    factories.pool(name='Next', active=True)
    m.StudentNote.query.filter_by(student_id=student.id).update({'student_id': None})
    db_session.delete(student)
    db_session.commit()
    note = client.get('/api/me/student-notes', headers=headers).get_json()['notes'][0]
    assert note['student_id'] is None and note['student_nick'] == 'pupil_one'
    assert client.patch(f"/api/me/student-notes/{note['id']}", headers=headers,
                        json={'text': 'История сохранена', 'updated_at': note['updated_at']}).status_code == 200
