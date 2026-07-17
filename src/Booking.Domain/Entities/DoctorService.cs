namespace Booking.Domain.Entities;

/// <summary>Shërbimi që e ofron një doktor konkret — me mundësi override të kohëzgjatjes/çmimit. Çelës i përbërë (DoctorId, MedicalServiceId).</summary>
public class DoctorService
{
    public Guid DoctorId { get; set; }
    public Guid MedicalServiceId { get; set; }
    public int? CustomDurationMinutes { get; set; }
    public decimal? CustomPrice { get; set; }
    public bool IsActive { get; set; } = true;

    public Doctor Doctor { get; set; } = null!;
    public MedicalService MedicalService { get; set; } = null!;
}
