# DSVTN Discord Bot

Bot Discord quản lý việc đổi tên cho Đội Sinh viên Tình nguyện, Khoa CNTT — HCMUS.

Hướng dẫn đầy đủ để cài đặt và vận hành: [HUONG_DAN_VAN_HANH.md](./HUONG_DAN_VAN_HANH.md).

## Chức năng đã có

- Thành viên tự đổi nickname qua `/doiten name:<Tên>` hoặc `!dsvtn Doiten <Tên>` (không phân biệt hoa/thường ở prefix).
- Danh sách xác nhận tên được lưu trên PostgreSQL qua Prisma.
- Người chưa xác nhận tên:
  - chat sẽ bị xóa; bot báo bằng embed không tag tại channel đó và tự xóa báo sau 20 giây;
  - thả reaction sẽ bị gỡ;
  - dùng slash command, button, select menu hay modal sẽ bị từ chối bằng embed ephemeral;
  - vào voice channel sẽ bị disconnect;
  - mọi trường hợp trên đều gửi DM (nếu Discord cho phép) và một warning có tag tại channel `#doi-ten` đã cấu hình. Warning ở `#doi-ten` được giữ lại.
- `Đội Trưởng` quản lý Technician; `Đội Trưởng` và `Technician` quản lý danh sách xác nhận tên.
- Reaction role dạng embed: button hoặc menu; hỗ trợ chỉ lấy role, chỉ gỡ role, hoặc toggle lấy/gỡ role.
- `/ping` đo độ trễ Discord và database ngay tại thời điểm gọi lệnh.
- Panel reaction role không thể cấp role `Đội Trưởng`, `Technician`, role Administrator, role integration hay role cao hơn bot.

## Cài đặt

1. Cài Node.js 22+ và PostgreSQL.
2. Sao chép `.env.example` thành `.env`, rồi điền các giá trị cần thiết.
3. Cài dependency và tạo bảng database:

```powershell
npm install
npm run db:push
```

4. Đăng ký slash command cho server thử nghiệm:

```powershell
npm run commands:deploy
```

5. Chạy bot:

```powershell
npm run dev
```

## Thiết lập Discord Developer Portal

Trong **Bot > Privileged Gateway Intents**, bật:

- Server Members Intent
- Message Content Intent

Mời bot bằng OAuth2 với scope `bot` và `applications.commands`. Bot cần các quyền:

- View Channels, Send Messages, Embed Links, Read Message History
- Manage Messages, Manage Nicknames, Manage Roles
- Manage Messages / Manage Reactions
- Connect và Move Members (để disconnect voice)

Role của bot phải cao hơn role của các thành viên mà bot cần đổi nickname hoặc thêm/bớt role.

## Cấu hình lần đầu

Người khởi tạo trước tiên dùng `/doiten` để xác nhận tên, sau đó một Discord Administrator chạy:

```text
/config setup doi-ten-channel:#doi-ten leader-role:@Đội Trưởng technician-role:@Technician
```

Hai role `verified-role` và `unverified-role` là tùy chọn. Hệ thống chặn dựa trên database, nên không bắt buộc phải tạo chúng.

Sau khi cấu hình, role `Đội Trưởng` có thể dùng `/config view` và toàn quyền quản lý; role `Technician` quản lý danh sách xác nhận tên.

## Phân quyền RBAC bằng permission chuỗi

Bot dùng RBAC nội bộ, tách biệt với Discord role. Mỗi **role nội bộ** có nhiều permission dạng chuỗi; sau đó liên kết role nội bộ với một hoặc nhiều Discord role. Khi thành viên dùng lệnh, bot lấy toàn bộ Discord role của họ và cộng dồn các permission tương ứng.

Các permission hiện có gồm: `admin.help`, `access.manage`, `config.manage`, `identity.read`, `identity.write`, `reaction_role.manage`, `system.check`, `technician.manage`. Có thể dùng wildcard `identity.*` hoặc `*` cho role được tin cậy, nhưng nên cấp từng permission cụ thể trong môi trường vận hành.

Discord Administrator luôn có toàn quyền để bootstrap và khôi phục cấu hình. Hai role cũ `Đội Trưởng` và `Technician` được tự chuyển thành role hệ thống tương thích khi bot kiểm tra quyền, nên server hiện hữu không bị gián đoạn.

Ví dụ tạo một role quản lý xác nhận tên:

```text
/access role-create key:identity-manager name:"Quản lý xác nhận tên"
/access permission-grant role:identity-manager permission:identity.read
/access permission-grant role:identity-manager permission:identity.write
/access bind role:identity-manager discord-role:@Ban Nhân sự
```

Dùng `/access permissions` để xem danh mục, `/access role-list` để kiểm tra role, và `/access member-permissions member:@user` để xem permission thực tế của một thành viên. Role hệ thống không sửa trực tiếp; hãy tạo role tùy chỉnh khi muốn phân quyền mới.

## Danh sách lệnh

### Thành viên

```text
/doiten name:Nguyễn Văn A
!dsvtn Doiten Nguyễn Văn A
```

Discord chỉ cho slash command dùng chữ thường, nên tên thực tế là `/doiten`, không phải `/Doiten`.

### Đội Trưởng và Technician

```text
/identity add member:@user name:"Nguyễn Văn A"
/identity remove member:@user
/identity update member:@user name:"Nguyễn Văn B"
/identity info member:@user
/identity list page:1
/identity search keyword:"Nguyễn"
/identity sync-nickname member:@user
```

### Chỉ Đội Trưởng

```text
/technician add member:@user
/technician remove member:@user
/technician list
/config view
/config setup ...
```

## Reaction role

`Đội Trưởng` và `Technician` đều có thể quản lý reaction role. Toàn bộ panel được lưu trong database và có tên quản lý riêng.

### Tạo một panel menu chọn nhiều role

```text
/reaction-role panel-create name:"ban-hoat-dong" style:Menu action:"Lấy hoặc gỡ role" title:"Chọn ban của bạn" description:"Bạn có thể chọn nhiều ban." max-selections:3
/reaction-role item-add panel:"ban-hoat-dong" role:@Ban Truyền thông label:"Truyền thông" emoji:📣 description:"Nội dung và hình ảnh"
/reaction-role item-add panel:"ban-hoat-dong" role:@Ban Hậu cần label:"Hậu cần" emoji:📦
/reaction-role publish name:"ban-hoat-dong" channel:#chon-vai-tro
```

`style:Button` tạo một button cho mỗi role; người dùng có thể bấm nhiều button. `style:Menu` cho phép chọn từ 1 đến `max-selections` role trong một lần. Một panel chứa tối đa 25 role (button có tối đa 5 button mỗi hàng).

### Ba chế độ action

| Chế độ | Khi thành viên chọn role |
|---|---|
| Chỉ lấy role | Chỉ thêm role nếu chưa có; không gỡ role đang có |
| Chỉ gỡ role | Chỉ gỡ role nếu đang có |
| Lấy hoặc gỡ role | Role chưa có sẽ được thêm, role đã có sẽ bị gỡ |

### Quản lý panel

```text
/reaction-role panel-list page:1
/reaction-role panel-info name:"ban-hoat-dong"
/reaction-role panel-edit name:"ban-hoat-dong" color:#3498DB footer:"DSVTN - HCMUS"
/reaction-role item-list panel:"ban-hoat-dong"
/reaction-role item-remove panel:"ban-hoat-dong" role:@Ban Hậu cần
/reaction-role refresh name:"ban-hoat-dong"
/reaction-role panel-disable name:"ban-hoat-dong"
/reaction-role panel-enable name:"ban-hoat-dong"
/reaction-role panel-delete name:"ban-hoat-dong"
```

Trong `panel-edit`, truyền `none` cho `description`, `footer`, `image-url` hoặc `thumbnail-url` để xóa giá trị đó. Nếu panel đã được publish, thao tác chỉnh embed, thêm/xóa item, bật/tắt panel sẽ tự render lại message. `/reaction-role refresh` dùng khi muốn đồng bộ thủ công.

### Builder Modal

```text
/reaction-role builder name:"ban-hoat-dong"
```

Mở preview riêng tư cùng button `Chỉnh nội dung`, `Chỉnh giao diện`, `Thêm field`, `Thêm button` (hoặc `Thêm option` với panel Menu) và channel picker để publish. Khi thêm role từ Builder, chọn role trong role picker rồi nhập nhãn, emoji và mô tả trong Modal; submit sẽ lưu database và tự cập nhật panel đã publish.

Các lệnh danh sách có nhiều trang hiển thị nút `← Trước` và `Sau →`; bấm nút sẽ cập nhật chính message riêng tư đang xem. `/reaction-role panel-list` liệt kê toàn bộ panel theo thời điểm cập nhật, chỉ gồm tên và mốc cập nhật. Nếu chạy `/reaction-role builder` với một tên chưa tồn tại, bot sẽ hỏi xác nhận tạo panel trống. Khi đồng ý, Builder được mở ngay cho panel mới (mặc định Button + lấy/gỡ role); mọi nội dung embed ban đầu đều để trống.

Embed field cũng được quản lý bằng `/reaction-role field-add`, `/reaction-role field-list` và `/reaction-role field-remove`.

## Hệ thống kiểm tra

Chạy bộ kiểm tra tự động trước khi deploy:

```powershell
npm test
npm run check
```

`npm test` kiểm tra command definition, giới hạn/renderer reaction role và các helper xử lý embed. `npm run check` chạy cả TypeScript build lẫn test suite.

Trong Discord, Đội Trưởng hoặc Technician có thể chạy:

```text
/system-check
```

Bot sẽ gửi một embed riêng tư kiểm tra database, quyền bot, role Đội Trưởng/Technician, quyền tại `#doi-ten`, slash command đã đăng ký và tính hợp lệ/an toàn của toàn bộ reaction-role panel hiện có. Đây là kiểm tra không làm thay đổi role, message hoặc dữ liệu.

## Lưu ý vận hành

- Mỗi lần tương tác bị chặn đều tạo một warning ở `#doi-ten`, đúng theo yêu cầu. Nếu server có spam, channel này có thể đầy nhanh; có thể bổ sung cooldown hoặc thread log ở giai đoạn sau.
- Khi một người dùng chặn DM, bot vẫn giữ warning ở `#doi-ten` và xử lý tại channel/interation gốc.
- Prefix command đổi tên sẽ bị bot xóa sau khi xử lý để tránh làm rối channel; phản hồi luôn là embed.
- Sau khi cập nhật source/schema, chạy lại `npm run db:push`, `npm run commands:deploy`, rồi khởi động lại bot để các lệnh reaction role xuất hiện trên Discord.
