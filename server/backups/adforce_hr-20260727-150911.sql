--
-- PostgreSQL database dump
--

\restrict zRc5I8HnxfxAooWokMRqEnOtypowp8Ll4TvzNDl9LxQgraMxbbq9YxrDJMAZSZy

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: announcements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.announcements (
    id text NOT NULL,
    title text NOT NULL,
    body text DEFAULT ''::text,
    date text,
    author text
);


ALTER TABLE public.announcements OWNER TO postgres;

--
-- Name: assets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.assets (
    id text NOT NULL,
    name text NOT NULL,
    asset_type text DEFAULT 'Other'::text NOT NULL,
    serial_number text DEFAULT ''::text,
    condition text DEFAULT 'Good'::text,
    remarks text DEFAULT ''::text,
    assigned_to text,
    assigned_date text,
    return_date text,
    status text DEFAULT 'available'::text,
    updated_at text
);


ALTER TABLE public.assets OWNER TO postgres;

--
-- Name: attendance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance (
    id text NOT NULL,
    user_id text NOT NULL,
    date text NOT NULL,
    check_in text,
    check_out text,
    breaks jsonb DEFAULT '[]'::jsonb,
    short_leaves jsonb DEFAULT '[]'::jsonb,
    break_start text,
    break_end text,
    auto_checkout boolean DEFAULT false,
    working_ms bigint,
    total_break_ms bigint,
    status text,
    late boolean DEFAULT false,
    source text DEFAULT 'manual'::text
);


ALTER TABLE public.attendance OWNER TO postgres;

--
-- Name: attendance_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance_logs (
    id integer NOT NULL,
    employee_id character varying(50),
    device_user_id integer NOT NULL,
    device_serial_number character varying(50) NOT NULL,
    punch_time timestamp without time zone NOT NULL,
    punch_type character varying(20) DEFAULT 'check_in'::character varying NOT NULL,
    verify_method character varying(20) DEFAULT 'unknown'::character varying,
    raw_data text,
    is_duplicate boolean DEFAULT false,
    synced_to_attendance boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.attendance_logs OWNER TO postgres;

--
-- Name: attendance_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.attendance_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.attendance_logs_id_seq OWNER TO postgres;

--
-- Name: attendance_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.attendance_logs_id_seq OWNED BY public.attendance_logs.id;


--
-- Name: biometric_devices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.biometric_devices (
    id integer NOT NULL,
    serial_number character varying(50) NOT NULL,
    device_name character varying(100),
    model character varying(50),
    firmware_version character varying(50),
    ip_address character varying(45),
    last_seen timestamp without time zone,
    is_active boolean DEFAULT true,
    attlog_stamp bigint DEFAULT 0,
    operlog_stamp bigint DEFAULT 0,
    attphoto_stamp bigint DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.biometric_devices OWNER TO postgres;

--
-- Name: biometric_devices_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.biometric_devices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.biometric_devices_id_seq OWNER TO postgres;

--
-- Name: biometric_devices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.biometric_devices_id_seq OWNED BY public.biometric_devices.id;


--
-- Name: biometric_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.biometric_logs (
    id integer NOT NULL,
    device_serial character varying(50),
    pin character varying(20) NOT NULL,
    scan_time timestamp without time zone NOT NULL,
    status integer DEFAULT 0,
    verify_type integer DEFAULT 0,
    processed boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.biometric_logs OWNER TO postgres;

--
-- Name: biometric_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.biometric_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.biometric_logs_id_seq OWNER TO postgres;

--
-- Name: biometric_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.biometric_logs_id_seq OWNED BY public.biometric_logs.id;


--
-- Name: biometric_raw_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.biometric_raw_logs (
    id integer NOT NULL,
    device_serial character varying(50),
    request_method character varying(10),
    request_path text,
    query_params text,
    request_body text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.biometric_raw_logs OWNER TO postgres;

--
-- Name: biometric_raw_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.biometric_raw_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.biometric_raw_logs_id_seq OWNER TO postgres;

--
-- Name: biometric_raw_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.biometric_raw_logs_id_seq OWNED BY public.biometric_raw_logs.id;


--
-- Name: biometric_user_map; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.biometric_user_map (
    id integer NOT NULL,
    employee_id character varying(50) DEFAULT ''::character varying NOT NULL,
    biometric_pin character varying(20) NOT NULL,
    employee_name character varying(100),
    enrolled boolean DEFAULT false,
    enrolled_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.biometric_user_map OWNER TO postgres;

--
-- Name: biometric_user_map_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.biometric_user_map_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.biometric_user_map_id_seq OWNER TO postgres;

--
-- Name: biometric_user_map_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.biometric_user_map_id_seq OWNED BY public.biometric_user_map.id;


--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.company_settings (
    id integer DEFAULT 1 NOT NULL,
    office_start text DEFAULT '09:00'::text,
    grace_minutes integer DEFAULT 15,
    currency text DEFAULT 'PKR'::text
);


ALTER TABLE public.company_settings OWNER TO postgres;

--
-- Name: device_commands; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.device_commands (
    id integer NOT NULL,
    device_serial character varying(50) NOT NULL,
    command_type character varying(50) NOT NULL,
    command_data text,
    status character varying(20) DEFAULT 'pending'::character varying,
    sent_at timestamp without time zone,
    completed_at timestamp without time zone,
    result text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.device_commands OWNER TO postgres;

--
-- Name: device_commands_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.device_commands_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.device_commands_id_seq OWNER TO postgres;

--
-- Name: device_commands_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.device_commands_id_seq OWNED BY public.device_commands.id;


--
-- Name: device_enrolled_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.device_enrolled_users (
    id integer NOT NULL,
    device_serial_number character varying(50) NOT NULL,
    device_user_id integer NOT NULL,
    name character varying(100) DEFAULT ''::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.device_enrolled_users OWNER TO postgres;

--
-- Name: device_enrolled_users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.device_enrolled_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.device_enrolled_users_id_seq OWNER TO postgres;

--
-- Name: device_enrolled_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.device_enrolled_users_id_seq OWNED BY public.device_enrolled_users.id;


--
-- Name: device_user_mapping; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.device_user_mapping (
    id integer NOT NULL,
    device_user_id integer NOT NULL,
    employee_id character varying(50) NOT NULL,
    device_serial_number character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.device_user_mapping OWNER TO postgres;

--
-- Name: device_user_mapping_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.device_user_mapping_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.device_user_mapping_id_seq OWNER TO postgres;

--
-- Name: device_user_mapping_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.device_user_mapping_id_seq OWNED BY public.device_user_mapping.id;


--
-- Name: holidays; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.holidays (
    id text NOT NULL,
    title text NOT NULL,
    date text NOT NULL,
    type text DEFAULT 'public'::text NOT NULL
);


ALTER TABLE public.holidays OWNER TO postgres;

--
-- Name: leave_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leave_requests (
    id text NOT NULL,
    user_id text NOT NULL,
    emp_name text NOT NULL,
    type text NOT NULL,
    from_date text NOT NULL,
    to_date text NOT NULL,
    days integer NOT NULL,
    note text DEFAULT ''::text,
    status text DEFAULT 'pending'::text,
    submitted text,
    paid_days integer,
    unpaid_days integer,
    pay_tag text
);


ALTER TABLE public.leave_requests OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id text NOT NULL,
    user_id text NOT NULL,
    title text NOT NULL,
    body text DEFAULT ''::text,
    type text DEFAULT 'announcement'::text NOT NULL,
    read boolean DEFAULT false,
    created_at text,
    link text DEFAULT ''::text
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: payroll; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payroll (
    id text NOT NULL,
    user_id text NOT NULL,
    month text NOT NULL,
    data jsonb NOT NULL
);


ALTER TABLE public.payroll OWNER TO postgres;

--
-- Name: policies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.policies (
    id text NOT NULL,
    title text NOT NULL,
    category text DEFAULT 'General'::text NOT NULL,
    body text DEFAULT ''::text,
    version integer DEFAULT 1,
    updated_at text,
    updated_by text DEFAULT ''::text,
    created_at text
);


ALTER TABLE public.policies OWNER TO postgres;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roles (
    id text NOT NULL,
    name text NOT NULL,
    permissions jsonb DEFAULT '[]'::jsonb NOT NULL
);


ALTER TABLE public.roles OWNER TO postgres;

--
-- Name: short_leave_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.short_leave_requests (
    id text NOT NULL,
    user_id text NOT NULL,
    emp_name text NOT NULL,
    date text NOT NULL,
    from_time text NOT NULL,
    to_time text NOT NULL,
    start_iso text,
    end_iso text,
    minutes integer DEFAULT 0,
    reason text DEFAULT ''::text,
    status text DEFAULT 'pending'::text,
    submitted text
);


ALTER TABLE public.short_leave_requests OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    role text DEFAULT 'Employee'::text NOT NULL,
    title text DEFAULT ''::text,
    dept text DEFAULT ''::text,
    team text DEFAULT ''::text,
    type text DEFAULT 'Full-time'::text,
    hired text DEFAULT ''::text,
    salary text DEFAULT ''::text,
    phone text DEFAULT ''::text,
    status text DEFAULT 'active'::text,
    leave_balance integer DEFAULT 24,
    sick_balance integer DEFAULT 0,
    skills jsonb DEFAULT '[]'::jsonb,
    first_login boolean DEFAULT false,
    temp_password text,
    cnic_enc text,
    marital_status text DEFAULT ''::text,
    guardian_name text DEFAULT ''::text,
    emergency_contact_name text DEFAULT ''::text,
    emergency_contact_phone text DEFAULT ''::text,
    emergency_contact_relation text DEFAULT ''::text,
    bank_name text DEFAULT ''::text,
    bank_branch text DEFAULT ''::text,
    bank_account text DEFAULT ''::text,
    bank_iban text DEFAULT ''::text,
    shift jsonb
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: warnings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.warnings (
    id text NOT NULL,
    user_id text NOT NULL,
    type text DEFAULT 'verbal'::text NOT NULL,
    reason text NOT NULL,
    date text NOT NULL,
    issued_by text NOT NULL,
    acknowledged boolean DEFAULT false
);


ALTER TABLE public.warnings OWNER TO postgres;

--
-- Name: attendance_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_logs ALTER COLUMN id SET DEFAULT nextval('public.attendance_logs_id_seq'::regclass);


--
-- Name: biometric_devices id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biometric_devices ALTER COLUMN id SET DEFAULT nextval('public.biometric_devices_id_seq'::regclass);


--
-- Name: biometric_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biometric_logs ALTER COLUMN id SET DEFAULT nextval('public.biometric_logs_id_seq'::regclass);


--
-- Name: biometric_raw_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biometric_raw_logs ALTER COLUMN id SET DEFAULT nextval('public.biometric_raw_logs_id_seq'::regclass);


--
-- Name: biometric_user_map id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biometric_user_map ALTER COLUMN id SET DEFAULT nextval('public.biometric_user_map_id_seq'::regclass);


--
-- Name: device_commands id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.device_commands ALTER COLUMN id SET DEFAULT nextval('public.device_commands_id_seq'::regclass);


--
-- Name: device_enrolled_users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.device_enrolled_users ALTER COLUMN id SET DEFAULT nextval('public.device_enrolled_users_id_seq'::regclass);


--
-- Name: device_user_mapping id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.device_user_mapping ALTER COLUMN id SET DEFAULT nextval('public.device_user_mapping_id_seq'::regclass);


--
-- Data for Name: announcements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.announcements (id, title, body, date, author) FROM stdin;
\.


--
-- Data for Name: assets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.assets (id, name, asset_type, serial_number, condition, remarks, assigned_to, assigned_date, return_date, status, updated_at) FROM stdin;
\.


--
-- Data for Name: attendance; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attendance (id, user_id, date, check_in, check_out, breaks, short_leaves, break_start, break_end, auto_checkout, working_ms, total_break_ms, status, late, source) FROM stdin;
att-1783505424598	u-ictjn4d	2026-07-08	2026-07-08T10:10:24.598Z	2026-07-08T12:16:39.507Z	[{"end": "2026-07-08T11:53:29.569Z", "start": "2026-07-08T11:48:45.926Z"}]	[]	\N	\N	f	7291266	283643	\N	f	manual
\.


--
-- Data for Name: attendance_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attendance_logs (id, employee_id, device_user_id, device_serial_number, punch_time, punch_type, verify_method, raw_data, is_duplicate, synced_to_attendance, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: biometric_devices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.biometric_devices (id, serial_number, device_name, model, firmware_version, ip_address, last_seen, is_active, attlog_stamp, operlog_stamp, attphoto_stamp, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: biometric_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.biometric_logs (id, device_serial, pin, scan_time, status, verify_type, processed, created_at) FROM stdin;
\.


--
-- Data for Name: biometric_raw_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.biometric_raw_logs (id, device_serial, request_method, request_path, query_params, request_body, created_at) FROM stdin;
\.


--
-- Data for Name: biometric_user_map; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.biometric_user_map (id, employee_id, biometric_pin, employee_name, enrolled, enrolled_at, created_at) FROM stdin;
\.


--
-- Data for Name: company_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.company_settings (id, office_start, grace_minutes, currency) FROM stdin;
1	09:00	15	PKR
\.


--
-- Data for Name: device_commands; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.device_commands (id, device_serial, command_type, command_data, status, sent_at, completed_at, result, created_at) FROM stdin;
\.


--
-- Data for Name: device_enrolled_users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.device_enrolled_users (id, device_serial_number, device_user_id, name, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: device_user_mapping; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.device_user_mapping (id, device_user_id, employee_id, device_serial_number, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: holidays; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.holidays (id, title, date, type) FROM stdin;
hol-pk-day-2026	Pakistan Day	2026-03-23	public
hol-labour-2026	Labour Day	2026-05-01	public
hol-independence-2026	Independence Day	2026-08-14	public
hol-eid-fitr-2026	Eid ul Fitr	2026-03-21	public
hol-eid-adha-2026	Eid ul Adha	2026-05-27	public
\.


--
-- Data for Name: leave_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.leave_requests (id, user_id, emp_name, type, from_date, to_date, days, note, status, submitted, paid_days, unpaid_days, pay_tag) FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, user_id, title, body, type, read, created_at, link) FROM stdin;
\.


--
-- Data for Name: payroll; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payroll (id, user_id, month, data) FROM stdin;
\.


--
-- Data for Name: policies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.policies (id, title, category, body, version, updated_at, updated_by, created_at) FROM stdin;
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roles (id, name, permissions) FROM stdin;
HR Admin	HR Admin	["view_dashboard", "view_people", "manage_employees", "manage_executives", "view_attendance", "view_attendance_reports", "approve_short_leave", "approve_leave", "view_leave", "view_policies", "manage_policies", "view_assets", "view_all_assets", "manage_assets", "view_announcements", "manage_announcements", "manage_company_settings", "view_payroll", "manage_payroll"]
Executive	Executive	["view_dashboard", "view_people", "manage_employees", "manage_executives", "manage_hr_admin", "view_attendance", "view_attendance_reports", "approve_short_leave", "approve_leave", "view_leave", "view_policies", "manage_policies", "view_assets", "view_all_assets", "manage_assets", "view_announcements", "manage_announcements", "manage_company_settings", "view_payroll", "manage_payroll"]
Manager	Manager	["view_dashboard", "view_attendance", "view_attendance_reports", "approve_short_leave", "approve_leave", "view_leave", "view_policies", "view_assets", "view_announcements", "view_payroll"]
Employee	Employee	["view_dashboard", "view_attendance", "view_leave", "view_policies", "view_assets", "view_announcements", "view_payroll"]
\.


--
-- Data for Name: short_leave_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.short_leave_requests (id, user_id, emp_name, date, from_time, to_time, start_iso, end_iso, minutes, reason, status, submitted) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, name, email, password, role, title, dept, team, type, hired, salary, phone, status, leave_balance, sick_balance, skills, first_login, temp_password, cnic_enc, marital_status, guardian_name, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, bank_name, bank_branch, bank_account, bank_iban, shift) FROM stdin;
u-k8lqnhc	Fahad Sajid	fahadnullbrainer@gmail.com	$2a$10$kMDWrOaDn/.U/MzX/ro3C.MToUAJh.Uzp5cIJ3bp6feMchp9q9TWK	Executive	CTO	Executive	Leadership	Full-time	2026-07-08			active	0	0	[]	f	\N	\N										\N
u-ictjn4d	Abdullah	abdullah65@gmail.com	$2a$10$xyuE3lWlNQCjHyZmqvUBkusg2L.7hMJR9D0Sz6eiV8tjxz28qvqwm	Employee	Wordpress Intern	Development	Website Development	Full-time	2026-06-01	80000	03007788501	active	24	0	[]	f	\N	enc:VVJeW0tRXR9eRBlKUQ==	Unmarried	Brother	Ahmad	03324566789	Big Brother	HBL	Gulberg	03087224354	PK00XXXX102837676875	{"shiftEnd": "21:30", "shiftStart": "02:30", "breakMinutes": 60, "graceMinutes": 15, "checkoutGraceMinutes": 10}
u-admin	Admin	admin@adforce.com	$2a$10$blVm2ZQEYKZLDiSvmStyJ.x0AjYmTdL.35awZ85xiPXSs86CFPPl6	HR Admin	HR Administrator	Management	HQ	Full-time	2024-01-01			active	24	0	[]	f	\N	\N										{"shiftEnd": "18:00", "shiftStart": "09:00", "breakMinutes": 60, "graceMinutes": 15, "checkoutGraceMinutes": 10}
\.


--
-- Data for Name: warnings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.warnings (id, user_id, type, reason, date, issued_by, acknowledged) FROM stdin;
\.


--
-- Name: attendance_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.attendance_logs_id_seq', 1, false);


--
-- Name: biometric_devices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.biometric_devices_id_seq', 1, false);


--
-- Name: biometric_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.biometric_logs_id_seq', 1, false);


--
-- Name: biometric_raw_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.biometric_raw_logs_id_seq', 1, false);


--
-- Name: biometric_user_map_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.biometric_user_map_id_seq', 1, false);


--
-- Name: device_commands_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.device_commands_id_seq', 1, false);


--
-- Name: device_enrolled_users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.device_enrolled_users_id_seq', 1, false);


--
-- Name: device_user_mapping_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.device_user_mapping_id_seq', 1, false);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: attendance_logs attendance_logs_device_serial_number_device_user_id_punch_t_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_logs
    ADD CONSTRAINT attendance_logs_device_serial_number_device_user_id_punch_t_key UNIQUE (device_serial_number, device_user_id, punch_time);


--
-- Name: attendance_logs attendance_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_logs
    ADD CONSTRAINT attendance_logs_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: biometric_devices biometric_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biometric_devices
    ADD CONSTRAINT biometric_devices_pkey PRIMARY KEY (id);


--
-- Name: biometric_devices biometric_devices_serial_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biometric_devices
    ADD CONSTRAINT biometric_devices_serial_number_key UNIQUE (serial_number);


--
-- Name: biometric_logs biometric_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biometric_logs
    ADD CONSTRAINT biometric_logs_pkey PRIMARY KEY (id);


--
-- Name: biometric_raw_logs biometric_raw_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biometric_raw_logs
    ADD CONSTRAINT biometric_raw_logs_pkey PRIMARY KEY (id);


--
-- Name: biometric_user_map biometric_user_map_biometric_pin_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biometric_user_map
    ADD CONSTRAINT biometric_user_map_biometric_pin_key UNIQUE (biometric_pin);


--
-- Name: biometric_user_map biometric_user_map_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.biometric_user_map
    ADD CONSTRAINT biometric_user_map_pkey PRIMARY KEY (id);


--
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (id);


--
-- Name: device_commands device_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.device_commands
    ADD CONSTRAINT device_commands_pkey PRIMARY KEY (id);


--
-- Name: device_enrolled_users device_enrolled_users_device_serial_number_device_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.device_enrolled_users
    ADD CONSTRAINT device_enrolled_users_device_serial_number_device_user_id_key UNIQUE (device_serial_number, device_user_id);


--
-- Name: device_enrolled_users device_enrolled_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.device_enrolled_users
    ADD CONSTRAINT device_enrolled_users_pkey PRIMARY KEY (id);


--
-- Name: device_user_mapping device_user_mapping_device_serial_number_device_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.device_user_mapping
    ADD CONSTRAINT device_user_mapping_device_serial_number_device_user_id_key UNIQUE (device_serial_number, device_user_id);


--
-- Name: device_user_mapping device_user_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.device_user_mapping
    ADD CONSTRAINT device_user_mapping_pkey PRIMARY KEY (id);


--
-- Name: holidays holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_pkey PRIMARY KEY (id);


--
-- Name: leave_requests leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payroll payroll_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll
    ADD CONSTRAINT payroll_pkey PRIMARY KEY (id);


--
-- Name: policies policies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.policies
    ADD CONSTRAINT policies_pkey PRIMARY KEY (id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: short_leave_requests short_leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.short_leave_requests
    ADD CONSTRAINT short_leave_requests_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: warnings warnings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warnings
    ADD CONSTRAINT warnings_pkey PRIMARY KEY (id);


--
-- Name: idx_attendance_logs_employee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_logs_employee ON public.attendance_logs USING btree (employee_id);


--
-- Name: idx_attendance_logs_punch_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_logs_punch_time ON public.attendance_logs USING btree (punch_time);


--
-- Name: idx_attendance_logs_unsynced; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_logs_unsynced ON public.attendance_logs USING btree (synced_to_attendance) WHERE ((synced_to_attendance = false) AND (is_duplicate = false));


--
-- Name: idx_biometric_logs_pin_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_biometric_logs_pin_time ON public.biometric_logs USING btree (pin, scan_time);


--
-- Name: idx_biometric_logs_processed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_biometric_logs_processed ON public.biometric_logs USING btree (processed) WHERE (processed = false);


--
-- Name: idx_biometric_user_map_employee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_biometric_user_map_employee ON public.biometric_user_map USING btree (employee_id);


--
-- Name: idx_device_enrolled_users_serial; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_device_enrolled_users_serial ON public.device_enrolled_users USING btree (device_serial_number);


--
-- Name: idx_device_user_mapping_employee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_device_user_mapping_employee ON public.device_user_mapping USING btree (employee_id);


--
-- PostgreSQL database dump complete
--

\unrestrict zRc5I8HnxfxAooWokMRqEnOtypowp8Ll4TvzNDl9LxQgraMxbbq9YxrDJMAZSZy

