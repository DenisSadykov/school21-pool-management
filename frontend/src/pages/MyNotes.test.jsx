import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyNotes, { NoteEditor } from './MyNotes';
import { api } from '../api';

jest.mock('../api', () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), del: jest.fn() } }));
const note = { id: 1, student_id: 4, student_nick: 'pupil', text: 'Наблюдение автора',
  created_at: '2026-10-11T12:00:00Z', updated_at: '2026-10-11T12:00:00Z' };
beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation(path => Promise.resolve(path === '/api/students'
    ? [{ id: 4, nick: 'pupil' }]
    : { notes: [note], total: 1, page: 1, has_more: false }));
});

it('shows personal history, nickname search and date sorting without a pool filter', async () => {
  render(<MemoryRouter><MyNotes /></MemoryRouter>);
  expect(await screen.findByText('Наблюдение автора')).toBeInTheDocument();
  expect(screen.getByText(/Другие пользователи их не видят/)).toBeInTheDocument();
  expect(screen.queryByText('Бассейн')).not.toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText('Ник пира'), { target: { value: 'PUPIL' } });
  fireEvent.change(screen.getByLabelText('Порядок записей'), { target: { value: 'oldest' } });
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/me/student-notes?q=PUPIL&sort=oldest&page=1'));
});

it('opens a pupil from the students page and saves a new note', async () => {
  api.post.mockResolvedValue({ ...note, id: 2 });
  render(<MemoryRouter initialEntries={['/my-notes?student_id=4']}><MyNotes /></MemoryRouter>);
  expect(await screen.findByLabelText('Пир')).toHaveValue('4');
  fireEvent.change(screen.getByLabelText('Текст заметки'), { target: { value: 'Новая запись' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/me/student-notes', { student_id: 4, text: 'Новая запись' }));
  expect(await screen.findByText('Заметка сохранена')).toBeInTheDocument();
  expect(screen.queryByLabelText('Текст заметки')).not.toBeInTheDocument();
});

it('edits a note and requires confirmation before deletion', async () => {
  api.patch.mockResolvedValue({ ...note, text: 'Исправлено' });
  api.del.mockResolvedValue({ message: 'Заметка удалена' });
  render(<MemoryRouter><MyNotes /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Редактировать заметку о @pupil' }));
  fireEvent.change(screen.getByLabelText('Текст заметки'), { target: { value: 'Исправлено' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  const deleteButton = await screen.findByRole('button', { name: 'Удалить заметку о @pupil' });
  expect(screen.getByText('Исправлено')).toBeInTheDocument();
  expect(api.patch).toHaveBeenCalledWith('/api/me/student-notes/1', { text: 'Исправлено', updated_at: note.updated_at });
  fireEvent.click(deleteButton);
  expect(api.del).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Да, удалить' }));
  await waitFor(() => expect(api.del).toHaveBeenCalledWith('/api/me/student-notes/1'));
});

it('keeps the draft on save failure and prevents duplicate submissions', async () => {
  let reject;
  api.post.mockImplementation(() => new Promise((resolve, fail) => { reject = fail; }));
  render(<NoteEditor students={[{ id: 4, nick: 'pupil' }]} selectedStudent={4} onSaved={jest.fn()} onCancel={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Текст заметки'), { target: { value: 'Не потерять' } });
  const submit = screen.getByRole('button', { name: 'Сохранить' });
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(api.post).toHaveBeenCalledTimes(1);
  reject(new Error('Сервер недоступен'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Сервер недоступен');
  expect(screen.getByLabelText('Текст заметки')).toHaveValue('Не потерять');
});

it('renders note text safely, not as HTML', async () => {
  api.get.mockImplementation(path => Promise.resolve(path === '/api/students' ? [] : {
    notes: [{ ...note, text: '<script>alert(1)</script>' }], total: 1, page: 1, has_more: false,
  }));
  const { container } = render(<MemoryRouter><MyNotes /></MemoryRouter>);
  expect(await screen.findByText('<script>alert(1)</script>')).toBeInTheDocument();
  expect(container.querySelector('script')).toBeNull();
});

it('protects an edit from search, sorting and page changes', async () => {
  render(<MemoryRouter><MyNotes /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Редактировать заметку о @pupil' }));
  fireEvent.change(screen.getByLabelText('Текст заметки'), { target: { value: 'Мой черновик' } });
  expect(screen.getByPlaceholderText('Ник пира')).toBeDisabled();
  expect(screen.getByLabelText('Порядок записей')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled();
  expect(screen.getByLabelText('Текст заметки')).toHaveValue('Мой черновик');
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(screen.getByPlaceholderText('Ник пира')).not.toBeDisabled();
});

it('recovers the latest revision while preserving the conflicting draft', async () => {
  const fresh = { ...note, text: 'Текст другой вкладки', updated_at: '2026-10-11T13:00:00Z' };
  api.patch.mockRejectedValueOnce(new Error('Заметка уже изменена. Обновите список и повторите.'))
    .mockResolvedValueOnce({ ...fresh, text: 'Мой черновик' });
  api.get.mockResolvedValue({ notes: [fresh], has_more: false });
  const onSaved = jest.fn();
  render(<NoteEditor note={note} onSaved={onSaved} onCancel={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Текст заметки'), { target: { value: 'Мой черновик' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Получить последнюю версию, сохранив мой текст' }));
  expect(await screen.findByText('Текст другой вкладки')).toBeInTheDocument();
  expect(screen.getByLabelText('Текст заметки')).toHaveValue('Мой черновик');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(api.patch).toHaveBeenLastCalledWith('/api/me/student-notes/1', { text: 'Мой черновик', updated_at: fresh.updated_at });
});
