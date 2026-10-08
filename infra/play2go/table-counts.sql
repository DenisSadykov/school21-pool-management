SELECT format('SELECT %L || ''|'' || count(*)::text FROM public.%I;', tablename, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
\gexec
