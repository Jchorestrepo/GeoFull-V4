-- Permitir eliminar zonas personalizadas sin violar FK en pedidos:
-- Al eliminar una zona, los pedidos asociados quedan con zona_id = NULL.
ALTER TABLE pedidos
    DROP CONSTRAINT IF EXISTS pedidos_zona_id_fkey;

ALTER TABLE pedidos
    ADD CONSTRAINT pedidos_zona_id_fkey
    FOREIGN KEY (zona_id)
    REFERENCES zonas_personalizadas(id)
    ON DELETE SET NULL;
