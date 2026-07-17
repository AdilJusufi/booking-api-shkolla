using Booking.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Booking.Infrastructure.Persistence.Configurations;

public class DoctorWorkingScheduleConfiguration : IEntityTypeConfiguration<DoctorWorkingSchedule>
{
    public void Configure(EntityTypeBuilder<DoctorWorkingSchedule> builder)
    {
        builder.HasIndex(s => new { s.DoctorId, s.ClinicBranchId, s.DayOfWeek });

        builder.HasOne(s => s.Doctor)
            .WithMany(d => d.WorkingSchedules)
            .HasForeignKey(s => s.DoctorId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(s => s.ClinicBranch)
            .WithMany()
            .HasForeignKey(s => s.ClinicBranchId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.ToTable(t =>
        {
            t.HasCheckConstraint("CK_DoctorWorkingSchedules_Times", "\"EndTime\" > \"StartTime\"");
            t.HasCheckConstraint("CK_DoctorWorkingSchedules_SlotDuration", "\"SlotDurationMinutes\" > 0");
        });
    }
}
