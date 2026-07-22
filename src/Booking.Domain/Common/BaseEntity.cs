namespace Booking.Domain.Common;

/// <summary>Baza e çdo entiteti — çelës primar Guid.</summary>
public abstract class BaseEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
}

/// <summary>Entitet me fusha auditimi. CreatedAt/UpdatedAt vendosen automatikisht nga interceptor-i i DbContext.</summary>
public abstract class AuditableEntity : BaseEntity
{
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
