-- +goose Up
-- +goose StatementBegin
ALTER TABLE code_rooms DROP CONSTRAINT code_rooms_type_check;
UPDATE code_rooms SET room_type = 'practice' WHERE room_type IN ('interview', 'pair_mock');
ALTER TABLE code_rooms
    ALTER COLUMN room_type SET DEFAULT 'practice',
    ADD CONSTRAINT code_rooms_type_check CHECK (room_type IN ('practice', 'system_design'));

ALTER TABLE code_room_participants DROP CONSTRAINT code_room_participants_role_check;
UPDATE code_room_participants SET role = 'participant' WHERE role = 'interviewer';
ALTER TABLE code_room_participants
    ADD CONSTRAINT code_room_participants_role_check CHECK (role IN ('owner', 'participant', 'viewer'));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 1;
-- +goose StatementEnd
