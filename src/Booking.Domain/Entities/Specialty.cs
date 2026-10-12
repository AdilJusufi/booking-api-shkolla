using Booking.Domain.Common;

namespace Booking.Domain.Entities;

/// <summary>Specializimi mjekësor (Dentist, Pediatër, Oftalmolog, ...). Menaxhohet nga SuperAdmin.</summary>
public class Specialty : AuditableEntity
{
    /// <summary>Emri kanonik, shqip — gjithmonë i detyrueshëm dhe fallback-u kur mungon përkthimi.</summary>
    public string Name { get; set; } = null!;

    /// <summary>Emri anglisht; null do të thotë "përdor <see cref="Name"/>".</summary>
    public string? NameEn { get; set; }

    /// <summary>Emri serbisht; null do të thotë "përdor <see cref="Name"/>".</summary>
    public string? NameSr { get; set; }

    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
}
