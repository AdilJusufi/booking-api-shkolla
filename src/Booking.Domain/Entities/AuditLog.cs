using Booking.Domain.Common;

namespace Booking.Domain.Entities;

/// <summary>Gjurmë auditimi për veprime të rëndësishme (CRUD administrativ, anulime, riplanifikime). Append-only.</summary>
public class AuditLog : BaseEntity
{
    public Guid? UserId { get; set; }
    public string Action { get; set; } = null!;
    public string EntityName { get; set; } = null!;
    public string? EntityId { get; set; }

    /// <summary>JSON i vlerave të vjetra — pa fusha sensitive (PersonalNumber, PasswordHash, TokenHash përjashtohen gjithmonë).</summary>
    public string? OldValues { get; set; }

    /// <summary>JSON i vlerave të reja — pa fusha sensitive.</summary>
    public string? NewValues { get; set; }

    public string? IpAddress { get; set; }
    public DateTime CreatedAt { get; set; }
}
