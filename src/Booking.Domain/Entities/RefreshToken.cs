using Booking.Domain.Common;

namespace Booking.Domain.Entities;

/// <summary>
/// Refresh token — ruhet VETËM si hash (SHA-256). Token-i i papërpunuar i kthehet klientit një herë dhe nuk ruhet kurrë.
/// Rotation: në çdo përdorim revokohet dhe zëvendësohet nga një token i ri (ReplacedByTokenId).
/// </summary>
public class RefreshToken : BaseEntity
{
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = null!;
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public Guid? ReplacedByTokenId { get; set; }
    public string? DeviceInfo { get; set; }
    public string? IpAddress { get; set; }

    public bool IsActive(DateTime utcNow) => RevokedAt is null && utcNow < ExpiresAt;
}
