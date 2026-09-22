-- =============================================================================
-- Migration 04: Carga Semilla de Usuarios Iniciales con Contraseñas Robustas
-- =============================================================================

-- 1. Insertar o actualizar Empresas (Tenants)
INSERT INTO public.empresas (id, nombre, nit, email_contacto, cuota_pedidos_mes, activo)
VALUES 
    ('global', 'SaaS Global Super Admin', '000000000-0', 'jchorestrepo@gmail.com', 9999999, true),
    ('empresa_demo', 'Empresa Demo Logística S.A.S.', '900123456-1', 'demo@empresa.com', 10000, true),
    ('emp_default_01', 'DeXpress Colombia SAS', '900999888-1', 'admin@dexpress.com.co', 10000, true)
ON CONFLICT (id) DO UPDATE 
SET nombre = EXCLUDED.nombre, activo = true;

-- 2. Insertar o actualizar Usuarios con Contraseñas Robustas
INSERT INTO usuarios (id, tenant_id, email, password_hash, nombre_completo, rol, activo)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'global', 'jchorestrepo@gmail.com', 'a1b2c3d4e5f67890a1b2c3d4e5f67890$07c90b3902e10ae571306be3caad6248fc52dd83ca83882d433927a66401ee20', 'JChorestrepo (Super Admin Global)', 'super_admin', true),
    ('a0000000-0000-0000-0000-000000000002', 'empresa_demo', 'demo@empresa.com', 'a1b2c3d4e5f67890a1b2c3d4e5f67890$3c682057251f719b140109e57a31fe6ba127a553afb77818b9fcdaa9f92d937e', 'Admin Empresa Demo', 'admin_empresa', true),
    ('a0000000-0000-0000-0000-000000000003', 'emp_default_01', 'admin@dexpress.com.co', 'a1b2c3d4e5f67890a1b2c3d4e5f67890$920aada4339aa3dee6be6af9df6fc51fcf7aa9606711cb21cba9f838279957dd', 'Admin DeXpress', 'admin_empresa', true)
ON CONFLICT (tenant_id, email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    rol = EXCLUDED.rol,
    activo = true;
