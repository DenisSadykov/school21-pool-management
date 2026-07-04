import app as app_module


def test_team_lead_can_create_group_review_for_active_pool(client, factories, auth_headers):
    team_lead = factories.user('lead', role='team_lead', password='lead1234')
    reviewer = factories.user('reviewer', role='volunteer', name='Reviewer User')
    pool = factories.pool('Active pool', active=True)
    factories.assign(reviewer, pool)

    response = client.post(
        '/api/group-reviews',
        headers=auth_headers(team_lead),
        json={
            'date': '2026-07-04',
            'time_start': '10:00',
            'quantity': 2,
            'reviewer_id': reviewer.id,
            'pool_id': pool.id,
        },
    )

    assert response.status_code == 201
    payload = response.get_json()
    assert payload['pool_id'] == pool.id
    assert payload['quantity'] == 2
    assert payload['reviewer']['id'] == reviewer.id

    review = app_module.db.session.get(app_module.GroupReview, payload['id'])
    assert review is not None
    assert review.created_by == team_lead.id
