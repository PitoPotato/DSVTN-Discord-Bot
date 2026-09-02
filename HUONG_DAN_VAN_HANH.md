# Hướng dẫn vận hành DSVTN Discord Bot

Tài liệu này hướng dẫn cài đặt, chạy, kiểm tra và sử dụng bot quản lý cộng đồng Đội Sinh viên Tình nguyện — Khoa CNTT, HCMUS.

## 1. Điều kiện cần có

- Node.js 22 trở lên.
- Một Discord application/bot và quyền quản trị server để mời bot.
- Supabase PostgreSQL project.
- File `.env` tại thư mục gốc của project. Không commit file này lên GitHub.

## 2. Cấu hình `.env`

Tạo file `.env` từ `.env.example`:

```powershell
Copy-Item .env.example .env
```

Điền các biến sau:

```env
DISCORD_TOKEN=token_bot_tu_Discord_Developer_Portal
APPLICATION_ID=application_id_cua_bot
GUILD_ID=id_server_discord_can_cai_bot

# Supabase: dùng Supavisor Session pooler, port 5432
DATABASE_URL="postgresql://postgres.PROJECT_REF:MAT_KHAU@aws-REGION.pooler.supabase.com:5432/postgres"
```

> Không dùng `NEXT_PUBLIC_SUPABASE_URL`, Supabase publishable key hay transaction pooler port `6543` cho bot hiện tại.

Nếu database password chứa ký tự đặc biệt như `@`, `:`, `/`, `#`, `%`, hãy URL-encode password trước khi đưa vào URL.

## 3. Thiết lập lần đầu

Chạy các lệnh dưới đây tại thư mục project.

```powershell
npm install
npm run db:migrate -- --name init
npm run db:generate
npm run commands:deploy
npm run check
npm run dev
```

Ý nghĩa:

| Lệnh | Dùng khi nào | Mục đích |
|---|---|---|
| `npm install` | Lần đầu hoặc sau khi pull source mới | Cài package cần thiết |
| `npm run db:migrate -- --name init` | Lần đầu, với Supabase database trống | Tạo bảng database và migration đầu tiên |
| `npm run db:generate` | Sau khi đổi Prisma schema hoặc cập nhật source | Tạo Prisma Client |
| `npm run commands:deploy` | Lần đầu hoặc sau khi thêm/sửa slash command | Đăng ký lệnh lên server Discord trong `GUILD_ID` |
| `npm run check` | Trước khi chạy/deploy | Build TypeScript và chạy test tự động |
| `npm run dev` | Mỗi khi muốn bot online | Khởi động bot ở chế độ development |

Bot online thành công khi terminal hiển thị:

```text
Đã đăng nhập với TenBot#1234.
```

Giữ cửa sổ terminal đang chạy để bot tiếp tục online.

## 4. Cấu hình Discord bắt buộc

Trong Discord Developer Portal, tại **Bot > Privileged Gateway Intents**, bật:

- Server Members Intent
- Message Content Intent

Mời bot với scope `bot` và `applications.commands`.

Bot cần các quyền:

- View Channels, Send Messages, Embed Links, Read Message History
- Manage Messages, Manage Nicknames, Manage Roles, Manage Reactions
- Connect và Move Members

Role bot phải đặt cao hơn role thành viên và tất cả role reaction role mà bot sẽ cấp/gỡ.

## 5. Cấu hình bot trong server

1. Tạo channel `#doi-ten` để nhận warning thành viên chưa đổi tên.
2. Tạo Discord role `Đội Trưởng` và `Technician`.
3. Người chạy cấu hình cần tự đổi tên trước:

```text
/doiten name:Tên của bạn
```

4. Một Discord Administrator chạy:

```text
/config setup doi-ten-channel:#doi-ten leader-role:@Đội Trưởng technician-role:@Technician
```

Hai option `verified-role` và `unverified-role` là tùy chọn; bot chặn tương tác dựa trên database nên không bắt buộc phải tạo chúng.

5. Kiểm tra toàn bộ cấu hình:

```text
/system-check
```

Lệnh này chỉ dành cho Đội Trưởng/Technician và không thay đổi dữ liệu. Nó kiểm tra database, quyền bot, role quản lý, channel warning, slash command và reaction role panel.

### 5.1. Ẩn lệnh quản trị khỏi thành viên thường

Bot chỉ bật `/doiten` cho mọi người theo mặc định. Các lệnh `/identity`, `/technician`, `/config`, `/reaction-role` và `/system-check` được Discord ẩn khỏi command picker của thành viên thường.

Sau mỗi lần chạy `npm run commands:deploy`, Discord Administrator cần cấp quyền command cho role quản lý:

1. Vào **Server Settings** → **Integrations** hoặc **Apps**.
2. Chọn ứng dụng **ĐSVTN Bot**.
3. Mở phần **Commands** / **Manage**.
4. Phân quyền theo bảng dưới đây.

| Command | Role được phép dùng/nhìn thấy |
|---|---|
| `/identity` | Đội Trưởng, Technician |
| `/reaction-role` | Đội Trưởng, Technician |
| `/ping` | Mọi thành viên |
| `/system-check` | Đội Trưởng, Technician |
| `/config` | Chỉ Đội Trưởng |
| `/technician` | Chỉ Đội Trưởng |

Bot vẫn kiểm tra role thêm một lần nữa ở code. Command permission chỉ quyết định command có hiện trên Discord hay không; không thay thế kiểm tra quyền thực tế của bot.

## 6. Luồng đổi tên thành viên

Thành viên chưa đổi tên chỉ có thể dùng một trong hai lệnh:

```text
/doiten name:Nguyễn Văn A
!dsvtn Doiten Nguyễn Văn A
```

Slash command Discord bắt buộc viết thường nên dùng `/doiten`, không phải `/Doiten`.

Sau khi thành công, bot đổi nickname và lưu thành viên vào database. Các interaction khác của người chưa đổi tên sẽ bị chặn:

| Hành động | Phản ứng của bot |
|---|---|
| Chat | Xóa tin nhắn; gửi embed không tag và xóa embed sau 20 giây |
| Reaction | Gỡ reaction |
| Slash command khác | Từ chối bằng embed ephemeral |
| Button/menu/modal | Từ chối bằng embed ephemeral |
| Vào voice | Disconnect |
| Mọi hành động bị chặn | DM thành viên nếu có thể; log warning có tag tại `#doi-ten` |

## 7. Quản lý danh sách đổi tên

Đội Trưởng và Technician dùng các lệnh sau:

```text
/identity add member:@user name:"Nguyễn Văn A"
/identity remove member:@user
/identity update member:@user name:"Nguyễn Văn B"
/identity info member:@user
/identity list page:1
/identity search keyword:"Nguyễn"
/identity sync-nickname member:@user
```

| Lệnh | Công dụng |
|---|---|
| `add` | Thêm/xác nhận tên thủ công, đồng thời đổi nickname |
| `remove` | Hủy xác nhận; thành viên phải đổi tên lại mới tương tác được |
| `update` | Sửa tên trong database và nickname Discord |
| `info` | Xem trạng thái một thành viên |
| `list` | Xem danh sách theo trang |
| `search` | Tìm gần đúng theo tên |
| `sync-nickname` | Đưa nickname Discord về đúng tên đã lưu |

## 8. Quản lý Technician

Chỉ Đội Trưởng dùng được:

```text
/technician add member:@user
/technician remove member:@user
/technician list
```

Technician có quyền quản lý danh sách đổi tên, reaction role và chạy system check; không thể thêm/xóa Technician hoặc thay đổi cấu hình gốc.

## 9. Reaction role

Đội Trưởng và Technician quản lý reaction role qua `/reaction-role`.

### 9.1. Tạo panel

Ví dụ panel menu, cho phép chọn tối đa ba role:

```text
/reaction-role panel-create name:"ban-hoat-dong" style:Menu action:"Lấy hoặc gỡ role" title:"Chọn ban của bạn" description:"Bạn có thể chọn nhiều ban." max-selections:3
```

Thêm item cho panel:

```text
/reaction-role item-add panel:"ban-hoat-dong" role:@Ban Truyền thông label:"Truyền thông" emoji:📣 description:"Nội dung và hình ảnh"
/reaction-role item-add panel:"ban-hoat-dong" role:@Ban Hậu cần label:"Hậu cần" emoji:📦
```

Gửi panel embed:

```text
/reaction-role publish name:"ban-hoat-dong" channel:#chon-vai-tro
```

### 9.2. Chọn style và action

| Option | Ý nghĩa |
|---|---|
| `style:Button` | Mỗi role là một button; người dùng có thể bấm nhiều button |
| `style:Menu` | Một menu cho phép chọn nhiều role cùng lúc |
| `action:Chỉ lấy role` | Chỉ thêm role nếu chưa có |
| `action:Chỉ gỡ role` | Chỉ gỡ role đang có |
| `action:Lấy hoặc gỡ role` | Có role thì gỡ, chưa có thì thêm |

Mỗi panel có tối đa 25 role. Button được xếp tối đa 5 button trên một hàng.

### 9.3. Chỉnh và quản lý panel

```text
/reaction-role panel-list page:1
/reaction-role panel-info name:"ban-hoat-dong"
/reaction-role panel-edit name:"ban-hoat-dong" title:"Tên mới" color:#3498DB footer:"DSVTN - HCMUS"
/reaction-role item-list panel:"ban-hoat-dong"
/reaction-role item-remove panel:"ban-hoat-dong" role:@Ban Hậu cần
/reaction-role refresh name:"ban-hoat-dong"
/reaction-role panel-disable name:"ban-hoat-dong"
/reaction-role panel-enable name:"ban-hoat-dong"
/reaction-role panel-delete name:"ban-hoat-dong"
```

Trong `panel-edit`, truyền `none` cho `description`, `footer`, `image-url` hoặc `thumbnail-url` để xóa giá trị đó.

### 9.4. Builder Modal (cách chỉnh trực quan)

Sau khi đã tạo panel, mở Builder riêng tư:

```text
/reaction-role builder name:"ban-hoat-dong"
```

Bot gửi preview embed cùng hai button và một channel picker:

| Thành phần | Công dụng |
|---|---|
| `Chỉnh nội dung` | Mở Modal sửa tiêu đề, mô tả và footer |
| `Chỉnh giao diện` | Mở Modal sửa màu, ảnh lớn và thumbnail |
| `Thêm field` | Mở Modal thêm tên, nội dung và tùy chọn inline cho embed field |
| `Thêm button` / `Thêm option` | Chọn role, rồi nhập nhãn, emoji và mô tả cho button/menu option |
| Channel picker | Chọn channel để publish panel ngay từ Builder |

Khi submit Modal, dữ liệu được lưu vào database. Nếu panel đã publish, bot tự cập nhật embed ở channel đó. Builder dùng role picker để thêm button/option; `/reaction-role item-add` vẫn hữu ích khi cần thao tác bằng slash command.

Các lệnh danh sách có nhiều trang có nút `← Trước` và `Sau →`; mỗi lần bấm bot cập nhật đúng message riêng tư đang xem. `/reaction-role panel-list` chỉ hiển thị tên panel và thời điểm cập nhật, sắp theo lần cập nhật mới nhất. Nếu chạy `/reaction-role builder` với một tên chưa tồn tại, bot sẽ hỏi có muốn tạo panel trống hay không. Khi đồng ý, bot tạo panel mặc định Button + lấy/gỡ role, để trống phần embed và mở Builder ngay.

### 9.5. Quản lý Embed Fields

Embed field dùng để trình bày thông tin theo từng ô, ví dụ yêu cầu của ban hoặc liên kết tài liệu.

```text
/reaction-role field-add panel:"ban-hoat-dong" name:"Lưu ý" value:"Chọn ban phù hợp với khả năng của bạn." inline:false
/reaction-role field-list panel:"ban-hoat-dong"
/reaction-role field-remove panel:"ban-hoat-dong" index:1
```

Mỗi panel có tối đa 25 field. Một field gồm tên (tối đa 256 ký tự), nội dung (tối đa 1024 ký tự) và tùy chọn `inline` để nhiều field hiển thị cùng một hàng.

Bot không cho đưa các role sau vào reaction role:

- `@everyone`
- Role Đội Trưởng hoặc Technician
- Role có Administrator
- Role integration/managed
- Role cao hơn hoặc bằng role bot

## 10. Kiểm tra và test

### Kiểm tra code trước khi chạy/deploy

```powershell
npm test
```

Chạy test tự động: command definitions, slash command surface, render reaction-role menu/button và helper embed.

```powershell
npm run check
```

Chạy TypeScript build và toàn bộ test. Nên chạy lệnh này trước mỗi lần deploy.

### Kiểm tra khi bot đã online

```text
/system-check
```

Nếu có dòng ❌ trong embed, xử lý theo nội dung gợi ý. Các lỗi phổ biến:

| Vấn đề | Cách xử lý |
|---|---|
| Slash commands thiếu | Chạy `npm run commands:deploy` |
| Không kết nối database | Kiểm tra `DATABASE_URL` Supabase và password |
| Thiếu quyền bot | Chỉnh role/quyền bot trong Discord |
| Không gửi được `#doi-ten` | Kiểm tra quyền View Channel, Send Messages, Embed Links tại channel |
| Reaction role không cấp được | Đưa role bot lên cao hơn role mục tiêu |

## 11. Error log và chống crash

Bot ghi lỗi theo từng ngày trong thư mục `logs/` tại thư mục project:

```text
logs/
└─ 2026-09-01.log
```

Mỗi lỗi có thời gian, hành động/lệnh, Discord guild/user ID và stack trace. Ví dụ terminal sẽ hiển thị:

```text
[2026-09-01 21:54:37 ICT] Error while using /identity list
Guild: ... | User: ...
...
```

Khi một interaction lỗi, bot cố gắng trả một embed chung báo rằng bot vẫn đang hoạt động. Lỗi của một command, reaction, voice event hoặc thao tác database không được phép làm bot tự dừng. Thư mục `logs/` đã được bỏ qua khỏi Git để tránh commit log vận hành.

## 12. Khi thay đổi database/schema

Khi chỉnh file `prisma/schema.prisma`, tạo migration mới:

```powershell
npm run db:migrate -- --name mo_ta_thay_doi
npm run db:generate
npm run check
```

Ví dụ:

```powershell
npm run db:migrate -- --name them_lich_su_diem_hoat_dong
```

Commit cả source code lẫn thư mục `prisma/migrations/`.

Không dùng `db:push` trên database Supabase production sau khi đã bắt đầu quản lý migration; ưu tiên migration để có lịch sử thay đổi rõ ràng.

## 13. Vận hành hằng ngày

### Chạy thủ công trên máy cá nhân

```powershell
npm run dev
```

Bot dừng khi tắt terminal, tắt máy hoặc mất mạng.

### Trước khi cập nhật bot

```powershell
npm install
npm run db:generate
npm run check
```

Nếu source có migration mới:

```powershell
npm run db:deploy
```

Nếu có slash command mới/sửa command definition:

```powershell
npm run commands:deploy
```

Sau đó restart bot:

```powershell
npm run dev
```

## 14. Xem dữ liệu trực quan

Chạy Prisma Studio để xem/sửa dữ liệu trực tiếp:

```powershell
npx prisma studio
```

Prisma Studio sẽ mở trình duyệt. Chỉ dùng để kiểm tra hoặc sửa dữ liệu có chủ đích; không xóa dữ liệu production khi chưa sao lưu.

## 15. Checklist khi bot không hoạt động

1. Kiểm tra terminal còn chạy và có dòng `Đã đăng nhập với ...`.
2. Chạy `/system-checnpm run checkk`.
3. Kiểm tra `DISCORD_TOKEN`, `APPLICATION_ID`, `GUILD_ID`, `DATABASE_URL` trong `.env`.
4. Kiểm tra Supabase project không bị pause và connection string là Session pooler port `5432`.
5. Kiểm tra role bot, quyền bot và role hierarchy trong Discord.
6. Chạy `npm run check` để phát hiện lỗi source/test.
7. Sau khi thay đổi slash command, chạy lại `npm run commands:deploy` và restart bot.
